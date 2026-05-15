import { apiClient } from "./client"

export type CreateOrderPayload = {
  ticket_type_id: string
  quantity: number
}

export type CreateOrderResponse = {
  order_id: string
  checkout_url: string
}

export async function createOrder(payload: CreateOrderPayload) {
  const response = await apiClient.post<CreateOrderResponse>("/orders", payload)
  return response.data
}
