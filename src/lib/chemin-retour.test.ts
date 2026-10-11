import { describe, expect, it } from 'vitest'

import { cheminDeRetour } from './chemin-retour'

/**
 * Chemin de retour après une Server Action (revue du 2026-10-03, constat m3) :
 * le champ `chemin` vient du formulaire, donc du client. Seul un chemin INTERNE
 * est suivi — sinon `redirect` enverrait vers un autre site (redirection
 * ouverte).
 */
describe('cheminDeRetour', () => {
  it('garde un chemin interne, requête comprise', () => {
    expect(cheminDeRetour('/admin/jetons?rencontre=abc', '/')).toBe('/admin/jetons?rencontre=abc')
  })

  it('remplace une URL absolue vers un autre site par le défaut', () => {
    expect(cheminDeRetour('https://exemple.org/piege', '/admin/clubs')).toBe('/admin/clubs')
  })

  it('remplace une URL « relative au protocole » (//hote) par le défaut', () => {
    expect(cheminDeRetour('//exemple.org/piege', '/')).toBe('/')
  })

  it('remplace un chemin commençant par /\\ (interprété comme //) par le défaut', () => {
    expect(cheminDeRetour('/\\exemple.org', '/')).toBe('/')
  })

  it('remplace un schéma javascript: ou un chemin relatif par le défaut', () => {
    expect(cheminDeRetour('javascript:alert(1)', '/')).toBe('/')
    expect(cheminDeRetour('admin/clubs', '/')).toBe('/')
  })

  it('remplace une valeur absente, vide ou non textuelle par le défaut', () => {
    expect(cheminDeRetour(null, '/admin/clubs')).toBe('/admin/clubs')
    expect(cheminDeRetour('', '/admin/clubs')).toBe('/admin/clubs')
    expect(cheminDeRetour(new File([], 'x'), '/admin/clubs')).toBe('/admin/clubs')
  })
})
