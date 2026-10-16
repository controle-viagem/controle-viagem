import { useSyncExternalStore } from 'react'
import { getSyncState, subscribeSync } from './engine'

/** Estado atual da sincronização, para as telas. */
export const useSync = () => useSyncExternalStore(subscribeSync, getSyncState)
