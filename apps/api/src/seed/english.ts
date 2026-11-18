import type { ContentTranslations } from "@synapse/domain";

const ENGLISH: Record<string, string> = {
  "Ocho villas frente al Mediterráneo": "Eight villas facing the Mediterranean",
  "Desarrollo residencial de ocho villas independientes con piscina privada, parcelas amplias y acceso a la playa en cinco minutos. Datos y renders ficticios para demostración.":
    "Residential development of eight detached villas with private pools, large plots and the beach five minutes away. Fictional data and renders for demonstration.",
  Sur: "South",
  Sureste: "Southeast",
  Suroeste: "Southwest",
  "Villa de tres dormitorios en el sector norte, con jardín privado y porche cubierto.": "Three-bedroom villa in the north sector, with a private garden and a covered porch.",
  "Villa luminosa de tres dormitorios con piscina privada y cocina abierta al salón.": "Bright three-bedroom villa with a private pool and a kitchen open to the living room.",
  "Villa de cuatro dormitorios con suite en planta baja y terraza orientada al mar.": "Four-bedroom villa with a ground-floor suite and a sea-facing terrace.",
  "Villa de cuatro dormitorios con amplio salón de doble altura y piscina.": "Four-bedroom villa with a large double-height living room and a pool.",
  "Villa en el sector sur con vistas abiertas, jardín mediterráneo y piscina.": "Villa in the south sector with open views, a Mediterranean garden and a pool.",
  "Villa de cuatro dormitorios con salón de doble altura, cocina abierta, terraza y piscina privada. Incluye recorrido 360 por todas las estancias.":
    "Four-bedroom villa with a double-height living room, open kitchen, terrace and private pool. Includes a 360 tour of every room.",
  "Villa de cinco dormitorios con zona de bienestar, gran terraza y piscina infinita.": "Five-bedroom villa with a wellness area, a large terrace and an infinity pool.",
  "Villa singular de cinco suites en la parcela más grande del desarrollo. Aún no publicada.": "One-of-a-kind villa with five suites on the largest plot of the development. Not yet listed.",
  Exterior: "Outside",
  "Exterior y piscina": "Outside and pool",
  Living: "Living room",
  Comedor: "Dining room",
  Cocina: "Kitchen",
  Dormitorio: "Bedroom",
  "Dormitorio principal": "Main bedroom",
  Baño: "Bathroom",
  "Entrar a la vivienda": "Go inside",
  "Salir al jardín": "Go out to the garden",
  "Ventanal de doble altura": "Double-height window",
  "Ventanal de 6 m de ancho y 4,6 m de alto con carpintería de aluminio y vidrio de baja emisividad.":
    "Window 6 m wide and 4.6 m high, with aluminium frames and low-emissivity glass.",
  "Villa 6 · Planta baja": "Villa 6 · Ground floor",
  "Living de doble altura": "Double-height living room",
  "Cocina con isla": "Kitchen with island",
  "Piscina y terraza": "Pool and terrace",
  "Vista aérea de la parcela": "Aerial view of the plot",
  "Playa del Faro": "Faro Beach",
  "5 min en coche": "5 min by car",
  "6 min andando": "6 min on foot",
  "7 min en coche": "7 min by car",
  "8 min en coche": "8 min by car",
  "10 min en coche": "10 min by car",
  "12 min en coche": "12 min by car",
  "15 min en coche": "15 min by car",
};

/** Demo `translations` for the given Spanish fields; fields without a known English text are left out. */
export function inEnglish(fields: Record<string, string | null | undefined>): ContentTranslations {
  const known = Object.entries(fields).flatMap(([field, text]) => (text && ENGLISH[text] ? [[field, ENGLISH[text]]] : []));
  return known.length > 0 ? { en: Object.fromEntries(known) } : {};
}
