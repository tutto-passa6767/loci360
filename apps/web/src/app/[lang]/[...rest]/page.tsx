import { notFound } from 'next/navigation';

/** Any unknown path inside a language renders the localised 404 within the site layout */
export default function CatchAll() {
  notFound();
}
