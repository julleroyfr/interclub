// Versionnement de l'application (docs/conventions/10-versionnement.md §4).
//
//   node scripts/version/version.mjs preparer <majeur|mineur|correctif>
//   node scripts/version/version.mjs taguer
//
// preparer : incrémente package.json (+ lock) et insère en tête du CHANGELOG un
//            brouillon de section (commits feat/fix + migrations depuis le dernier tag).
// taguer   : commite « chore(release): vX.Y.Z » et pose le tag annoté vX.Y.Z.
// Rien n'est poussé : le push sur main (= déploiement prod) reste manuel.

import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const CHANGELOG = 'CHANGELOG.md'
const INCREMENTS = { majeur: 'major', mineur: 'minor', correctif: 'patch' }

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function arreter(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function versionCourante() {
  return JSON.parse(readFileSync('package.json', 'utf8')).version
}

function dernierTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*')
  } catch {
    return null
  }
}

function exigerMainPropre() {
  if (git('branch', '--show-current') !== 'main') arreter('À lancer sur la branche main.')
  if (git('status', '--porcelain') !== '') arreter('Arbre de travail non propre.')
}

/** « feat(qr): retirer la notion de jeton » → « Retirer la notion de jeton (qr) ». */
function entree(sujet) {
  const [, portee, texte] = sujet.match(/^\w+(?:\(([^)]*)\))?!?:\s*(.*)$/)
  return `- ${texte.charAt(0).toUpperCase()}${texte.slice(1)}${portee ? ` (${portee})` : ''}`
}

function brouillon(version, tag) {
  const date = new Date().toLocaleDateString('sv-SE') // AAAA-MM-JJ, heure locale
  const lignes = [`## [${version}] — ${date}`, '']

  if (!tag) {
    lignes.push(
      'Première version taguée : état de l’application à sa mise en production.',
      'Historique antérieur : `git log` et `docs/specs/`.',
      '',
    )
    return lignes.join('\n')
  }

  const sujets = git('log', `${tag}..HEAD`, '--no-merges', '--format=%s').split('\n').filter(Boolean)
  const sections = [
    ['Ajouté', sujets.filter((s) => /^feat\b/.test(s))],
    ['Corrigé', sujets.filter((s) => /^fix\b/.test(s))],
  ]
  for (const [titre, liste] of sections) {
    if (liste.length) lignes.push(`### ${titre}`, '', ...liste.map(entree), '')
  }

  const migrations = git('diff', '--name-only', '--diff-filter=A', `${tag}..HEAD`, '--', 'supabase/migrations')
    .split('\n')
    .filter((f) => /^supabase\/migrations\/\d{12}_[^/]+\.sql$/.test(f))
    .map((f) => `- \`${f.split('/').pop().replace(/\.sql$/, '')}\` (cf. supabase/migrations/JOURNAL.md)`)
  if (migrations.length) lignes.push('### Migrations à appliquer', '', ...migrations, '')

  if (lignes.length === 2) lignes.push('_Aucun commit feat/fix depuis le dernier tag : à compléter._', '')
  return lignes.join('\n')
}

function preparer(type) {
  const increment = INCREMENTS[type]
  if (!increment) arreter(`Type attendu : ${Object.keys(INCREMENTS).join(' | ')}.`)
  exigerMainPropre()

  const tag = dernierTag()
  execSync(`npm version ${increment} --no-git-tag-version`, { stdio: 'ignore' })
  const version = versionCourante()

  const changelog = readFileSync(CHANGELOG, 'utf8').replace(/\r\n/g, '\n').trimEnd()
  const position = changelog.indexOf('\n## [')
  const section = brouillon(version, tag)
  const nouveau =
    position === -1
      ? `${changelog}\n\n${section}`
      : `${changelog.slice(0, position).trimEnd()}\n\n${section}\n${changelog.slice(position + 1)}`
  writeFileSync(CHANGELOG, `${nouveau.trimEnd()}\n`)

  console.log(`✓ Version ${version} préparée (depuis ${tag ?? 'aucun tag'}).`)
  console.log(`  1. Relire et réécrire la section [${version}] de ${CHANGELOG}.`)
  console.log('  2. npm run version:taguer')
}

function taguer() {
  const version = versionCourante()
  const tag = `v${version}`
  if (git('branch', '--show-current') !== 'main') arreter('À lancer sur la branche main.')
  if (git('tag', '--list', tag) !== '') arreter(`Le tag ${tag} existe déjà.`)
  if (!readFileSync(CHANGELOG, 'utf8').includes(`## [${version}]`)) {
    arreter(`Pas de section [${version}] dans ${CHANGELOG} : lancer d'abord version:preparer.`)
  }

  git('add', 'package.json', 'package-lock.json', CHANGELOG)
  execFileSync('git', ['commit', '-m', `chore(release): ${tag}`], { stdio: 'inherit' })
  git('tag', '-a', tag, '-m', `Version ${version}`)

  console.log(`✓ ${tag} commité et tagué (non poussé).`)
  console.log('  git push origin main --follow-tags   # = mise en production')
  console.log('  puis : git checkout develop && git merge main && git push')
}

const [commande, argument] = process.argv.slice(2)
if (commande === 'preparer') preparer(argument)
else if (commande === 'taguer') taguer()
else arreter('Usage : version.mjs preparer <majeur|mineur|correctif> | taguer')
