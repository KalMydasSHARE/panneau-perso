'use strict';
/* KalMydas PERSO : le coffre aussi sur le serveur perso (api.kalmydas.com/perso), pour le retrouver sur tous les appareils.
   Il part tel qu'il est dans le navigateur, déjà chiffré par le mot de passe du panneau : le serveur ne peut rien lire.
   La connexion au serveur a son propre mot de passe (celui du coffre perso, le même que l'Atelier) ; l'appareil
   n'envoie qu'une preuve tirée de ce mot de passe, jamais le mot de passe. Une connexion tient 180 jours sur l'appareil. */
const Serveur = {
  // Adresse fixe ; on ne la change que pour un essai sur ce PC (127.0.0.1), jamais depuis la page en ligne
  url() { const enLigne = 'https://api.kalmydas.com/perso/'; try { return (location.hostname === '127.0.0.1' && localStorage.getItem('kmp.srv.url')) || enLigne; } catch { return enLigne; } },
  etat() { try { return JSON.parse(localStorage.getItem('kmp.srv')) || {}; } catch { return {}; } },
  garde(o) { try { localStorage.setItem('kmp.srv', JSON.stringify({ ...this.etat(), ...o })); } catch { /* place manquante */ } },
  connecte() { const e = this.etat(); return !!e.jeton && e.expire > Date.now(); },
  async empreinte(s) { return b64enc(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s || '')))); },
  async preuve(mdp) { // mêmes réglages que l'Atelier
    const base = await crypto.subtle.importKey('raw', enc.encode(mdp), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('kal-perso|acces|v1'), iterations: 310000, hash: 'SHA-256' }, base, 256);
    return [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
  },
  async appel(chemin, opt = {}) {
    const j = this.etat().jeton, r = await fetch(this.url() + chemin, { ...opt, headers: { 'Content-Type': 'application/json', ...(j ? { Authorization: 'Bearer ' + j } : {}) } });
    if (r.status === 401 && chemin !== 'api/connexion') this.garde({ jeton: '', expire: 0 });
    return r;
  },
  async connexion(mdp) {
    const r = await this.appel('api/connexion', { method: 'POST', body: JSON.stringify({ preuve: await this.preuve(mdp), app: 'panneau' }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || 'Connexion refusée');
    const { jeton, expire } = await r.json(); this.garde({ jeton, expire, err: '' });
  },
  deconnexion() { this.appel('api/deconnexion', { method: 'POST' }).catch(() => {}); this.garde({ jeton: '', expire: 0 }); },
  // Avant le déverrouillage : si le serveur a plus récent, il remplace le coffre de ce navigateur (l'ancien reste en copie .prev)
  async tirer() {
    if (!this.connecte()) return 'hors';
    const r = await this.appel('api/coffre/panneau', { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) return 'vide';
    if (!r.ok) return 'erreur';
    const c = await r.json(), e = this.etat();
    if (c.ver <= (e.ver || 0)) return 'ajour';
    const local = localStorage.getItem(VAULT_KEY);
    if (local && (await this.empreinte(local)) !== e.h &&
      !confirm('Le coffre a changé sur un autre appareil, et aussi sur celui-ci.\n\nOK : prendre celui de l\'autre appareil.\nAnnuler : garder celui-ci (il remplacera l\'autre).')) {
      this.garde({ ver: c.ver }); this.pousser(); return 'garde';
    }
    if (local) localStorage.setItem(VAULT_KEY + '.prev', local);
    localStorage.setItem(VAULT_KEY, c.data); this.garde({ ver: c.ver, h: await this.empreinte(c.data), maj: c.maj, err: '' });
    return 'pris';
  },
  minuteur: null,
  apresEcriture() { if (!this.connecte()) return; clearTimeout(this.minuteur); this.minuteur = setTimeout(() => this.pousser(), 3000); },
  async pousser() {
    if (!this.connecte()) return 'hors';
    const data = localStorage.getItem(VAULT_KEY); if (!data) return 'vide';
    const h = await this.empreinte(data), e = this.etat(); if (h === e.h) return 'ajour';
    try {
      const r = await this.appel('api/coffre/panneau', { method: 'PUT', body: JSON.stringify({ base: e.ver || 0, data }) });
      if (r.status === 409) { // un autre appareil a envoyé entre-temps : on demande lequel garder
        const c = await r.json();
        if (confirm('Le coffre a changé sur un autre appareil.\n\nOK : prendre celui de l\'autre appareil (le panneau se verrouille, retape ton mot de passe).\nAnnuler : garder celui-ci et remplacer l\'autre.')) {
          const g = await (await this.appel('api/coffre/panneau')).json();
          await Vault.lock(); localStorage.setItem(VAULT_KEY + '.prev', localStorage.getItem(VAULT_KEY)); localStorage.setItem(VAULT_KEY, g.data);
          this.garde({ ver: g.ver, h: await this.empreinte(g.data), maj: g.maj }); location.reload(); return 'pris';
        }
        this.garde({ ver: c.ver }); return this.pousser();
      }
      if (!r.ok) throw new Error('réponse ' + r.status);
      const c = await r.json(); this.garde({ ver: c.ver, h, maj: c.maj, err: '' }); return 'ok';
    } catch (err) {
      this.garde({ err: String(err.message || err) }); clearTimeout(this.minuteur); this.minuteur = setTimeout(() => this.pousser(), 30000); return 'erreur';
    }
  },
  // Fenêtre « Se connecter au serveur » : apres() est appelé une fois connecté
  fenetre(apres) {
    const pw = inp('password', '', { autocomplete: 'current-password' });
    modal('Serveur perso', h('div', { class: 'form' }, field('Mot de passe du serveur perso', pw, 'Le même que l\'Atelier. À taper une fois par appareil.')),
      [{ label: 'Se connecter', run: async () => { try { await this.connexion(pw.value); toast('Connecté au serveur'); if (apres) await apres(); } catch (e) { toast(e.message); return false; } } }]);
  }
};
function serveurCard() {
  const e = Serveur.etat(), on = Serveur.connecte();
  return h('section', { class: 'card' }, h('h3', null, 'Serveur perso (tous tes appareils)'),
    h('p', { class: 'muted' }, 'Le coffre est aussi gardé sur ton serveur, chiffré : tu le retrouves sur le téléphone et sur le PC. Le serveur ne peut pas le lire.'),
    h('p', null, on ? `Connecté jusqu'au ${new Date(e.expire).toLocaleDateString('fr-CH')}. Dernier envoi : ${e.maj ? new Date(e.maj).toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' }) : 'pas encore'}.` : 'Pas connecté sur cet appareil.'),
    e.err && on ? h('p', { class: 'err' }, `Dernier essai raté (${e.err}) : nouvel essai tout seul.`) : null,
    h('div', { class: 'row wrap' },
      on ? h('button', { class: 'btn', onclick: async () => { const r = await Serveur.pousser(); toast(r === 'ok' || r === 'ajour' ? 'Coffre à jour sur le serveur' : 'Pas envoyé, nouvel essai tout seul'); rerender(); } }, 'Envoyer maintenant')
        : h('button', { class: 'btn', onclick: () => Serveur.fenetre(async () => { await Serveur.pousser(); rerender(); }) }, 'Se connecter'),
      on ? h('button', { class: 'btn small ghost', onclick: () => { Serveur.deconnexion(); rerender(); } }, 'Se déconnecter') : null));
}
