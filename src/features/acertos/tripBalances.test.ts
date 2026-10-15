import { describe, expect, it } from 'vitest'
import type { Expense, Person, Settlement, Trip } from '../../db/types'
import { editContext } from './tripBalances'

const person = (id: string, name: string): Person => ({ id, name, tripId: 'v', createdAt: '', updatedAt: '' })
const travelers = [person('eu', 'Eu'), person('ana', 'Ana'), person('joao', 'João'), person('leo', 'Léo')]
const trip = { id: 'v', groups: [{ id: 'silva', name: 'Casal Silva', memberIds: ['ana', 'joao'] }] } as unknown as Trip
const parking = {
  id: 'e', amount: 4000, currency: 'USD', payerId: 'eu',
  split: { mode: 'igual', shares: ['eu', 'ana', 'joao', 'leo'].map((personId) => ({ personId })) },
} as Expense
const row = (fromId: string, amount: number, batchId: string): Settlement =>
  ({ id: `${batchId}${fromId}`, batchId, tripId: 'v', date: '2026-10-15', fromId, toId: 'eu', currency: 'USD', amount, note: '', createdAt: '', updatedAt: '' })

const data = (settlements: Settlement[]) => ({
  expenses: [parking], settlements, travelers, people: new Map(travelers.map((p) => [p.id, p])),
})

describe('editar um acerto já feito', () => {
  it('acerto do casal volta com o grupo escolhido, o total e os saldos sem ele', () => {
    const batch = [row('ana', 1000, 'b1'), row('joao', 1000, 'b1')]
    const ctx = editContext(trip, data([...batch, row('leo', 500, 'b2')]), batch)
    expect(ctx.draft).toEqual({ fromId: 'silva', toId: 'eu', currency: 'USD', amount: 2000 })
    // Sem o próprio acerto, o casal volta a dever US$ 10 cada; o do Léo continua abatido.
    expect(ctx.balances.get('ana')?.get('USD')).toBe(-1000)
    expect(ctx.balances.get('leo')?.get('USD')).toBe(-500)
  })

  it('pessoas que não formam um grupo viram uma parte própria', () => {
    const batch = [row('ana', 1000, 'b1'), row('leo', 1000, 'b1')]
    const ctx = editContext(trip, data(batch), batch)
    const from = ctx.parties.find((p) => p.id === ctx.draft.fromId)
    expect(from).toMatchObject({ name: 'Ana + Léo', memberIds: ['ana', 'leo'] })
  })
})
