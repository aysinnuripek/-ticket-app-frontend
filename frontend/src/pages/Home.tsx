import { useEffect, useMemo, useState } from "react"
import EventCard from "../components/EventCard"
import { getEvents } from "../api/events"
import type { EventItem } from "../data/events"

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim()
}

function formatOptionLabel(value: string) {
  const normalized = normalizeText(value)

  if (normalized === "istanbul") {
    return "Istanbul"
  }

  if (normalized === "izmir") {
    return "Izmir"
  }

  if (normalized === "ankara") {
    return "Ankara"
  }

  const trimmed = value.trim()

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function getUniqueOptions(values: string[]) {
  const seen = new Set<string>()
  const options = ["All"]

  values.forEach((value) => {
    const normalized = normalizeText(value)

    if (!seen.has(normalized)) {
      seen.add(normalized)
      options.push(formatOptionLabel(value))
    }
  })

  return options
}

export default function Home() {
  const [eventList, setEventList] = useState<EventItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCity, setSelectedCity] = useState("All")
  const [selectedCategory, setSelectedCategory] = useState("All")

  useEffect(() => {
    getEvents()
      .then((data) => {
        const mapped = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          city: item.city,
          category: item.category,
          date: item.starts_at,
          price: item.price,
          imageUrl: item.image_url,
          description: item.description,
        }))
        setEventList(mapped)
      })
      .catch((err) => console.error("Failed to load events", err))
  }, [])

  const cities = useMemo(() => {
    return getUniqueOptions(eventList.map((event) => event.city))
  }, [eventList])

  const categories = useMemo(() => {
    return getUniqueOptions(eventList.map((event) => event.category))
  }, [eventList])

  const filteredEvents = useMemo(() => {
    const search = normalizeText(searchTerm)

    return eventList.filter((event) => {
      const matchesSearch =
        normalizeText(event.title).includes(search) ||
        normalizeText(event.description).includes(search) ||
        normalizeText(event.city).includes(search) ||
        normalizeText(event.category).includes(search)

      const matchesCity =
        selectedCity === "All" ||
        normalizeText(event.city) === normalizeText(selectedCity)

      const matchesCategory =
        selectedCategory === "All" ||
        normalizeText(event.category) === normalizeText(selectedCategory)

      return matchesSearch && matchesCity && matchesCategory
    })
  }, [eventList, searchTerm, selectedCity, selectedCategory])

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="mb-10">
        <h1 className="text-4xl font-bold text-slate-900">
          Find your next event
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Browse concerts, theatre, sports, and festivals. Select your ticket and receive a digital QR ticket after payment.
        </p>
      </section>

      <section className="mb-8 rounded-2xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Search
            </span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              placeholder="Search event, city, category..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              City
            </span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              value={selectedCity}
              onChange={(event) => setSelectedCity(event.target.value)}
            >
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Category
            </span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Showing {filteredEvents.length} of {eventList.length} events.
        </p>
      </section>

      {filteredEvents.length === 0 ? (
        <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            No events found
          </h2>
          <p className="mt-2 text-slate-600">
            Try changing your search, city, or category filter.
          </p>
        </section>
      ) : (
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      )}
    </main>
  )
}
