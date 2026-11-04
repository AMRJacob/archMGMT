import Wishlist from '../components/Wishlist.tsx'

/** Wishlist & problems on its own page (sidebar, under Settings & data). */
export default function WishlistPage() {
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Wishlist &amp; problems</h1>
          <p className="muted">Ask for something the app should do, or tell us what’s not working. Everyone can see the list and its status.</p>
        </div>
      </header>
      <Wishlist />
    </section>
  )
}
