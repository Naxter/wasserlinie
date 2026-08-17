import { useState } from 'react'

// Two obligations and one duty of care, in one place.
//
// The BKG geometry is dl-de/by-2-0, which requires the Quellenvermerk to name
// the provider, the licence, and the dataset — in the product, not only in the
// README. This app skeletonises wide rivers out of polygons and simplifies the
// country outline, so §3 also requires it to say the data was changed.
// The terrain tiles carry their own required wording. PEGELONLINE is
// DL-DE→Zero-2.0 and requires nothing at all, but naming it is what lets a
// reader go and check the authoritative number.
//
// The warning notice is not a legal requirement; it is the honest answer to
// what a red river on a map of Germany makes people think.
export function Credits() {
  const [open, setOpen] = useState(false)
  return (
    <div className={open ? 'notice open' : 'notice'}>
      <p className="warning">
        <strong>Kein Warndienst.</strong> Amtliche Hochwasserinformationen geben die Länder heraus:{' '}
        <a href="https://www.hochwasserzentralen.de" target="_blank" rel="noreferrer">
          hochwasserzentralen.de
        </a>
        .
      </p>

      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Datenquellen schließen' : 'Datenquellen & Hinweise'}
      </button>

      {open && (
        <div className="sources">
          <p>
            <b>Wasserstände</b> PEGELONLINE (WSV), DL-DE→Zero-2.0. Ungeprüfte Rohdaten — sie können Ausreißer und
            Messfehler enthalten.{' '}
            <a href="https://www.pegelonline.wsv.de" target="_blank" rel="noreferrer">
              pegelonline.wsv.de
            </a>
          </p>
          <p>
            <b>Flussnetz und Landesgrenze</b> © GeoBasis-DE / BKG {new Date().getFullYear()} (Daten verändert),{' '}
            <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noreferrer">
              dl-de/by-2-0
            </a>{' '}
            — DLM1000 und VG2500,{' '}
            <a href="https://gdz.bkg.bund.de" target="_blank" rel="noreferrer">
              gdz.bkg.bund.de
            </a>
          </p>
          <p>
            <b>Gelände</b> Europe terrain data produced using Copernicus data and information funded by the European
            Union — EU-DEM layers; global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.
          </p>
          <p className="caveat">
            Die Farbe zeigt, wie ungewöhnlich der Wasserstand für diesen Pegel und diese Jahreszeit ist — nicht, wie
            hoch das Wasser vor Ort steht. Zwischen zwei Pegeln ist der Verlauf interpoliert. Der Flussverlauf ist im
            Maßstab 1:1.000.000 dargestellt und kann einige hundert Meter vom tatsächlichen Gewässer abweichen.
          </p>
        </div>
      )}
    </div>
  )
}
