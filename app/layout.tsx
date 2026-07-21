import type { Metadata } from 'next'
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google'
import Navbar from '@/components/Navbar'
import './globals.css'

const barlowCondensed = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
})

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: 'CSE DU Sports',
  description: 'Department sports event management system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-bg text-text font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}