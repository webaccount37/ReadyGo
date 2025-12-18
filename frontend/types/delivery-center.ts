/**
 * Delivery center types matching backend schemas.
 */

export interface DeliveryCenter {
  id: string;
  name: string;
  code: string;
}

export interface DeliveryCenterListResponse {
  items: DeliveryCenter[];
  total: number;
}

export type DeliveryCenterResponse = DeliveryCenter;
