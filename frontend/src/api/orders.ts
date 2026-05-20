import { apiClient } from "./client"

export type OrderItem = {
  name: string
  unit_price_cents: number
  quantity: number
}

export type CreateOrderPayload = {
  items: OrderItem[]
}

export type CreateOrderResponse = {
  order_id: string
  checkout_url: string
}

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled"

export type Order = {
  id: string
  status: OrderStatus
  total_cents: number
}

export async function createOrder(payload: CreateOrderPayload) {
  const response = await apiClient.post<CreateOrderResponse>("/orders", payload)
  return response.data
}

export async function getOrder(orderId: string) {
  const response = await apiClient.get<Order>(`/orders/${orderId}`)
  return response.data
}
