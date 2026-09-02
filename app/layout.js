import "./globals.css";

export const metadata = {
  title: "FixFirst: segurança de sites sem complicação",
  description: "Descubra o que merece atenção primeiro e acompanhe cada correção.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f8f7",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
