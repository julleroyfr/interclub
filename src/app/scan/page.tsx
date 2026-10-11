import type { Metadata } from 'next'
import { Suspense } from 'react'

import { ScanQr } from './scan-qr'

export const metadata: Metadata = {
  title: 'Scan QR — Interclub',
}

export default function PageScan() {
  return (
    <Suspense>
      <ScanQr />
    </Suspense>
  )
}
