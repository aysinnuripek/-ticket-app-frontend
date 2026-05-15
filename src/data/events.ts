export type EventItem = {
  id: string
  title: string
  city: string
  category: string
  date: string
  price: number
  imageUrl: string
  description: string
}

export const events: EventItem[] = [
  {
    id: "1",
    title: "Istanbul Jazz Night",
    city: "Istanbul",
    category: "Concert",
    date: "2026-06-12",
    price: 750,
    imageUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a",
    description: "A live jazz concert with local and international artists."
  },
  {
    id: "2",
    title: "Ankara Theatre Festival",
    city: "Ankara",
    category: "Theatre",
    date: "2026-06-20",
    price: 420,
    imageUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35",
    description: "A theatre festival featuring modern and classical plays."
  },
  {
    id: "3",
    title: "Izmir Summer Fest",
    city: "Izmir",
    category: "Festival",
    date: "2026-07-05",
    price: 980,
    imageUrl: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30",
    description: "Outdoor summer festival with food, music, and entertainment."
  }
]
