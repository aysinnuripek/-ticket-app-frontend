import { apiClient } from "./client"

export type EventDto = {
  id: string
  title: string
  description: string
  category: string
  city: string
  starts_at: string
  image_url: string
}

export async function getEvents() {
  const response = await apiClient.get<EventDto[]>("/events")
  return response.data
}

export async function getEvent(id: string) {
  const response = await apiClient.get<EventDto>(`/events/${id}`)
  return response.data
}
