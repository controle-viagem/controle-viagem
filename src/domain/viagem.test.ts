import { describe, expect, it } from 'vitest'
import { dayNumber, daysBetween, defaultTrip, phaseOf, sortTrips, statusLabel, tripDays, tripStatus } from './viagem'

const orlando = { id: 'o', startDate: '2026-12-20', endDate: '2027-01-03' }

describe('viagem', () => {
  it('conta os dias incluindo o primeiro e o último, atravessando o ano', () => {
    expect(tripDays(orlando)).toBe(15)
    expect(tripDays({ startDate: '2026-11-01', endDate: '2026-11-01' })).toBe(1)
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2)
  })

  it('fase do gasto pela data', () => {
    expect(phaseOf('2026-06-10', orlando)).toBe('antes')
    expect(phaseOf('2026-12-20', orlando)).toBe('durante')
    expect(phaseOf('2027-01-03', orlando)).toBe('durante')
    expect(phaseOf('2027-01-10', orlando)).toBe('depois')
  })

  it('número do dia', () => {
    expect(dayNumber('2026-12-20', orlando)).toBe(1)
    expect(dayNumber('2027-01-01', orlando)).toBe(13)
    expect(dayNumber('2026-12-01', orlando)).toBeNull()
  })

  it('situação da viagem', () => {
    expect(tripStatus(orlando, '2026-10-14')).toBe('planejada')
    expect(tripStatus(orlando, '2026-12-25')).toBe('andamento')
    expect(tripStatus(orlando, '2027-02-01')).toBe('encerrada')
  })

  it('ordem: em andamento, próximas, encerradas', () => {
    const today = '2026-10-14'
    const trips = [
      { id: 'velha', startDate: '2025-01-01', endDate: '2025-01-10' },
      { id: 'longe', startDate: '2027-07-01', endDate: '2027-07-10' },
      { id: 'agora', startDate: '2026-10-10', endDate: '2026-10-20' },
      orlando,
      { id: 'recente', startDate: '2026-05-01', endDate: '2026-05-10' },
    ]
    expect(sortTrips(trips, today).map((t) => t.id)).toEqual(['agora', 'o', 'longe', 'recente', 'velha'])
    expect(defaultTrip(trips, today)?.id).toBe('agora')
    expect(defaultTrip([], today)).toBeUndefined()
  })
})

describe('viagem encerrada pelo dono', () => {
  it('vai para o fim da lista e aparece como "Encerrada"', () => {
    const today = '2026-10-14'
    const trips = [
      { id: 'fechada', startDate: '2026-10-10', endDate: '2026-10-20', closed: true },
      { id: 'velha', startDate: '2025-01-01', endDate: '2025-01-10' },
    ]
    expect(sortTrips(trips, today).map((t) => t.id)).toEqual(['velha', 'fechada'])
    expect(statusLabel(trips[0], today)).toBe('Encerrada')
    expect(statusLabel(trips[1], today)).toBe('Terminou')
  })
})
