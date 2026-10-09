import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ pathname: '/admin', recherche: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.recherche),
}))

import { IndicateurNavigation } from './IndicateurNavigation'

/** Indicateur de chargement global (spec #12 R26). */
/** Clic : l'écouteur global (phase de capture) passe avant ce preventDefault,
 *  qui évite seulement à jsdom de tenter une vraie navigation. */
function cliquer(nom: string) {
  const lien = screen.getByRole('link', { name: nom })
  lien.addEventListener('click', (e) => e.preventDefault(), { once: true })
  fireEvent.click(lien)
}

describe('IndicateurNavigation (spec #12 R26)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigation.pathname = '/admin'
    navigation.recherche = ''
  })
  afterEach(() => vi.useRealTimers())

  function rendre() {
    return render(
      <>
        <IndicateurNavigation />
        <a href="/admin/clubs">Clubs</a>
        <a href="/admin/rencontres/1/classement/pdf" download>
          Exporter en PDF
        </a>
      </>,
    )
  }

  it('rien n’est affiché au repos', () => {
    rendre()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('spinner « Chargement… » après un court délai suivant un clic interne', () => {
    rendre()
    cliquer('Clubs')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
  })

  it('pas de clignotement si la page s’affiche avant le délai', () => {
    const { rerender } = rendre()
    cliquer('Clubs')
    navigation.pathname = '/admin/clubs'
    rerender(
      <>
        <IndicateurNavigation />
        <a href="/admin/clubs">Clubs</a>
      </>,
    )
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('disparaît quand la nouvelle page est affichée', () => {
    const { rerender } = rendre()
    cliquer('Clubs')
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
    navigation.pathname = '/admin/clubs'
    rerender(
      <>
        <IndicateurNavigation />
        <a href="/admin/clubs">Clubs</a>
      </>,
    )
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('aucun spinner pour un téléchargement (export PDF)', () => {
    rendre()
    cliquer('Exporter en PDF')
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('se masque de lui-même au bout de 20 s si la navigation n’aboutit pas', () => {
    rendre()
    cliquer('Clubs')
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
