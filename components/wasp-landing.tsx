import NextLink from 'next/link'
import { Button, Heading, Link, Text } from '@primer/react'

export function WaspLanding() {
  return (
    <main className="wasp-page">
      <header className="wasp-header">
        <NextLink className="wasp-wordmark" href="/" aria-label="Wasp, accueil">
          Wasp
        </NextLink>
        <nav className="wasp-header-actions" aria-label="Navigation principale">
          <Link href="#security">Sécurité</Link>
          <Button as="a" href="/login" variant="default">
            Se connecter
          </Button>
        </nav>
      </header>

      <section className="wasp-hero" aria-labelledby="hero-title">
        <div className="wasp-hero-copy">
          <span className="wasp-eyebrow">COFFRE NUMÉRIQUE PRIVÉ</span>
          <Heading as="h1" id="hero-title" className="wasp-hero-title">
            Vos secrets. Un seul endroit sûr.
          </Heading>
          <Text className="wasp-hero-description">
            Un coffre chiffré dans votre navigateur, pour organiser vos accès et
            les partager sans e-mail.
          </Text>
          <div className="wasp-hero-actions">
            <Button as="a" href="/login" variant="primary">
              Continuer avec Google
            </Button>
            <Link href="#security">En savoir plus</Link>
          </div>
        </div>
        <WorkspacePreview />
      </section>

      <section
        className="wasp-features"
        id="security"
        aria-label="Principes de sécurité"
      >
        <Feature
          title="Chiffré avant l’envoi"
          description="Les valeurs sont chiffrées dans le navigateur. Le serveur ne reçoit que des données chiffrées."
        />
        <Feature
          title="Partage sans e-mail"
          description="Invitez par pseudo ou créez un lien privé, sans révéler votre adresse."
        />
        <Feature
          title="Importez vos fichiers .env"
          description="Réunissez vos variables de développement, de test et de production."
        />
      </section>

      <footer className="wasp-footer">
        <span>Wasp · Coffre numérique privé</span>
        <Link href="#security">Modèle de sécurité</Link>
      </footer>
    </main>
  )
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <article className="wasp-feature">
      <strong>{title}</strong>
      <span>{description}</span>
    </article>
  )
}

function WorkspacePreview() {
  return (
    <div className="wasp-preview" aria-label="Aperçu de l’espace Wasp">
      <aside className="wasp-preview-sidebar" aria-label="Navigation de l’espace">
        <span className="wasp-preview-brand">Wasp</span>
        <span className="wasp-preview-nav wasp-preview-nav-active">Vue générale</span>
        <span className="wasp-preview-nav">Coffres</span>
        <span className="wasp-preview-nav">Projets</span>
        <span className="wasp-preview-nav">Secrets</span>
        <span className="wasp-preview-nav">Variables ENV</span>
      </aside>
      <div className="wasp-preview-main">
        <div className="wasp-preview-topline">
          <span className="wasp-preview-title">Vue générale</span>
          <span aria-hidden="true">···</span>
        </div>
        <div className="wasp-preview-empty">
          <strong>Votre espace privé</strong>
          <span>Les secrets restent chiffrés jusqu’à leur révélation.</span>
        </div>
      </div>
    </div>
  )
}
