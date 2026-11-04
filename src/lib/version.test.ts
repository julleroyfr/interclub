import { describe, expect, it } from 'vitest'

import { libelleVersion } from './version'

/** Version exposée dans la balise meta (convention 10 §5). */
describe('libelleVersion (convention 10 §5)', () => {
  it('production Netlify : X.Y.Z+commit court', () => {
    expect(
      libelleVersion('1.5.0', {
        CONTEXT: 'production',
        BRANCH: 'main',
        COMMIT_REF: 'abc1234def5678',
      }),
    ).toBe('1.5.0+abc1234')
  })

  it('production Vercel : X.Y.Z+commit court', () => {
    expect(
      libelleVersion('1.5.0', {
        VERCEL_ENV: 'production',
        VERCEL_GIT_COMMIT_REF: 'main',
        VERCEL_GIT_COMMIT_SHA: 'abc1234def5678',
      }),
    ).toBe('1.5.0+abc1234')
  })

  it('recette (develop) : X.Y.Z-branche+commit', () => {
    expect(
      libelleVersion('1.5.0', {
        CONTEXT: 'branch-deploy',
        BRANCH: 'develop',
        COMMIT_REF: 'abc1234def5678',
      }),
    ).toBe('1.5.0-develop+abc1234')
    expect(
      libelleVersion('1.5.0', {
        VERCEL_ENV: 'preview',
        VERCEL_GIT_COMMIT_REF: 'develop',
        VERCEL_GIT_COMMIT_SHA: 'abc1234def5678',
      }),
    ).toBe('1.5.0-develop+abc1234')
  })

  it('preview de feature : nom de branche normalisé', () => {
    expect(
      libelleVersion('1.5.0', {
        CONTEXT: 'deploy-preview',
        BRANCH: 'feature/Classement_Calcul',
        COMMIT_REF: '9f8e7d6c5b4a',
      }),
    ).toBe('1.5.0-feature-classement-calcul+9f8e7d6')
  })

  it('local (aucune info de déploiement) : X.Y.Z-local', () => {
    expect(libelleVersion('1.5.0', {})).toBe('1.5.0-local')
  })

  it('branche connue sans commit : pas de métadonnée de build', () => {
    expect(libelleVersion('1.5.0', { CONTEXT: 'branch-deploy', BRANCH: 'develop' })).toBe(
      '1.5.0-develop',
    )
  })
})
