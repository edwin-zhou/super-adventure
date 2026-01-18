import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Super Adventure - Interactive Whiteboard',
  description: 'An interactive whiteboard with AI assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
