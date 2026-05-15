import { events as defaultEvents } from "./events"
import type { EventItem } from "./events"

const EVENTS_STORAGE_KEY = "events"

export function getStoredEvents(): EventItem[] {
  const storedEvents = localStorage.getItem(EVENTS_STORAGE_KEY)

  if (!storedEvents) {
    return defaultEvents
  }

  try {
    const parsedEvents = JSON.parse(storedEvents) as EventItem[]

    if (!Array.isArray(parsedEvents) || parsedEvents.length === 0) {
      return defaultEvents
    }

    return parsedEvents
  } catch {
    return defaultEvents
  }
}

export function saveEvent(event: EventItem) {
  const currentEvents = getStoredEvents()
  const updatedEvents = [event, ...currentEvents]

  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(updatedEvents))
}

export function resetEvents() {
  localStorage.removeItem(EVENTS_STORAGE_KEY)
}
