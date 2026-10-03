import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EcranErreur } from './EcranErreur'

/** Écran d'erreur technique (spec #12 R25, rév. 2026-10-03, décision D-G). */
describe('EcranErreur (spec #12 R25)', () => {
  it('affiche « Une erreur est survenue » sans détail technique (R25)', () => {
    render(<EcranErreur onReessayer={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Une erreur est survenue' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent(/Error|stack|digest|undefined/i)
  })

  it('« Réessayer » relance le rendu (R25)', () => {
    const onReessayer = vi.fn()
    render(<EcranErreur onReessayer={onReessayer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onReessayer).toHaveBeenCalledTimes(1)
  })

  it('« Revenir à l’accueil » mène à `/`, qui redirige selon le rôle (R25, R7)', () => {
    render(<EcranErreur onReessayer={() => {}} />)
    expect(screen.getByRole('link', { name: 'Revenir à l’accueil' })).toHaveAttribute('href', '/')
  })
})
