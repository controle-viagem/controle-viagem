import { describe, expect, it } from 'vitest'
import { peoplePerTrip } from './migracao'

describe('pessoas passam a ser de cada viagem', () => {
  const build = () => ({
    people: [
      { id: 'eu', name: 'Eu' },
      { id: 'ana', name: 'Ana' },
      { id: 'leo', name: 'Léo' },
      { id: 'sobra', name: 'Ninguém usa' },
    ],
    trips: [
      { id: 'v1', travelerIds: ['eu', 'ana', 'leo'], groups: [{ id: 'g', name: 'Casal', memberIds: ['eu', 'ana'] }] },
      { id: 'v2', travelerIds: ['eu', 'ana'], groups: [{ id: 'g2', name: 'Casal', memberIds: ['eu', 'ana'] }] },
    ],
    expenses: [
      { id: 'e1', tripId: 'v1', payerId: 'ana', split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] } },
      { id: 'e2', tripId: 'v2', payerId: 'ana', split: { mode: 'igual', shares: [{ personId: 'eu' }, { personId: 'ana' }] } },
    ],
    settlements: [{ id: 's2', tripId: 'v2', fromId: 'eu', toId: 'ana' }],
  })

  it('cada viagem fica com a sua cópia da pessoa, e os ids são trocados só na segunda', () => {
    let n = 0
    const d = peoplePerTrip(build(), () => `novo${++n}`)
    expect(d.people.map((p) => [p.id, p.tripId])).toEqual([
      ['eu', undefined], ['ana', 'v1'], ['leo', 'v1'], ['novo1', 'v2'],
    ])
    expect(d.expenses[0]).toMatchObject({ payerId: 'ana' })
    expect(d.expenses[1]).toMatchObject({ payerId: 'novo1', split: { shares: [{ personId: 'eu' }, { personId: 'novo1' }] } })
    expect(d.settlements[0]).toMatchObject({ fromId: 'eu', toId: 'novo1' })
    expect(d.trips[1].groups).toEqual([{ id: 'g2', name: 'Casal', memberIds: ['eu', 'novo1'] }])
  })

  it('quem não estava em viagem sai, e as viagens perdem a lista de viajantes', () => {
    const d = peoplePerTrip(build(), () => 'x')
    expect(d.people.some((p) => p.id === 'sobra')).toBe(false)
    expect(d.trips.every((t) => !('travelerIds' in t))).toBe(true)
  })

  it('pessoa que só aparece num gasto (saiu da lista de viajantes) continua na viagem', () => {
    const data = build()
    data.trips[0].travelerIds = ['eu']
    const d = peoplePerTrip(data, () => 'x')
    expect(d.people.find((p) => p.id === 'ana')?.tripId).toBe('v1')
  })
})
