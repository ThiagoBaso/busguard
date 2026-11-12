export type UserRole = 'admin' | 'driver' | 'responsible' | 'supervisor';
export type TripStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type RouteShift = 'morning' | 'afternoon' | 'evening';
export type AccessAction = 'entry' | 'exit';

export interface CurrentUser { id: number; role: UserRole }
export interface User extends CurrentUser {
  name: string; email: string; phone: string; cpf: string; rg: string; created_at: string;
}
export interface Address {
  id: number; cep: string; rua: string; numero: string; bairro: string;
  cidade: string; estado: string; complemento: string | null;
  latitude: number | null; longitude: number | null; coordinate_source: 'demo' | 'manual';
}
export interface Passenger {
  id: number; name: string; birth_date: string; rg: string; cpf: string;
  facial: string | null; addresses_id: number; created_at: string;
}
export interface Responsible { id: number; addresses_id: number; users_id: number }
export interface PassengerResponsible { id: number; passengers_id: number; responsible_id: number }
export interface Cnh {
  id_cnh: number; numero_registro: string; numero_espelho: string; categoria: string;
  data_emissao: string; data_validade: string; data_primeira_habilitacao: string;
  uf_emissao: string; observacoes: string | null; status_cnh: string; atualizado_em: string;
}
export interface Driver { id: number; users_id: number; cnh_id_cnh: number }
export interface DriverVehicle {
  id: number; driver_id: number; vehicle_id: number; active: boolean; assigned_at: string;
}
export interface Vehicle {
  id: number; plate: string; model: string; capacity: number; created_at: string;
}
export interface Route {
  id: number; name: string; description: string | null; shift: RouteShift;
  active: boolean; created_at: string;
}
export interface RouteStop {
  id: number; route_id: number; address_id: number; sequence: number; created_at: string;
}
export interface RoutePassenger {
  id: number; route_id: number; passenger_id: number; stop_id: number | null; active: boolean; created_at: string;
}
export interface RouteGeometry { coordinates: [number, number][]; distance_m: number; duration_s: number }
export interface NextStopRoute extends RouteGeometry { stop_id: number; stop_sequence: number; routed: boolean }
export interface Supervisor { id: number; user_id: number; created_at: string }
export interface Trip {
  id: number; route_id: number; vehicle_id: number; driver_id: number;
  supervisor_id: number | null; trip_date: string; scheduled_time: string | null; started_at: string | null;
  finished_at: string | null; status: TripStatus; created_at: string;
}
export interface AccessEvent {
  id: number; passenger_id: number; vehicle_id: number; action: AccessAction; created_at: string;
  event_uuid: string | null; trip_id: number | null; actor_id: number | null; occurred_at: string | null;
  review_status: 'accepted' | 'pending' | 'rejected'; review_reason: string | null;
}
export interface AccessEventReview { id: number; event_id: number; reviewer_id: number; decision: 'accepted' | 'rejected'; reason: string; created_at: string }
export interface EventHistoryItem extends AccessEvent {
  passenger_name: string; vehicle_model: string; vehicle_plate: string; actor_name: string | null;
  review: AccessEventReview | null; reviewer_name: string | null;
}
export interface EventHistoryPage {
  items: EventHistoryItem[]; total: number; limit: number; offset: number;
  summary: { pending: number; entries_today: number; exits_today: number };
}
export interface TripManifest {
  trip_id: number; route_id: number; vehicle_id: number; driver_user_id: number; driver_name: string | null;
  supervisor_user_id: number | null; supervisor_name: string | null; captured_at: string;
  passengers: Array<{ passenger_id: number; name: string; stop_id: number | null; stop_sequence: number | null }>;
}
export interface RouteChangePage {
  total: number; limit: number; offset: number;
  items: Array<{ id: number; entity_type: 'passenger' | 'stop'; entity_id: number; operation: 'create' | 'update' | 'delete';
    actor_id: number | null; actor_name: string | null; before: Record<string, string | number | boolean | null> | null;
    after: Record<string, string | number | boolean | null> | null; created_at: string }>;
}
export interface OperationAlerts {
  pending_events: number; active_trips: number; stale_communications: number;
  trips: Array<TripCommunication & { vehicle_model: string; vehicle_plate: string; route_name: string }>;
}
export interface TripCommunication { trip_id: number; received_at: string | null; status: 'recent' | 'stale' | 'unknown'; stale_after_seconds: number }
export interface VehicleLocation {
  id: number; trip_id: number; latitude: number; longitude: number;
  speed_kmh: number | null; source: 'gps' | 'demo'; recorded_at: string;
}
export interface LiveVehicleLocation extends VehicleLocation {
  vehicle_id: number; plate: string; vehicle_label: string; capacity: number;
  driver_name: string; route_name: string; trip_status: TripStatus;
}
export interface DriverProfile { driver: Driver; user: User; cnh: Cnh }
export interface NoticeMessage { tone: 'success' | 'error' | 'info'; message: string }

export type PageKey =
  | 'dashboard' | 'passengers' | 'drivers' | 'vehicles' | 'routes'
  | 'trips' | 'events' | 'administrators' | 'gps';
