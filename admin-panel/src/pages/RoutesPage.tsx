import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import { Button, EmptyState, Field, LoadingState, Modal, PageTitle, Panel, Pill, SelectInput, SummaryCard, TextInput, formatAddress, routeShiftLabel } from '../components';
import { CoordinatesEditor, parseCoordinates } from '../CoordinatesEditor';
import { RouteMap } from '../RouteMap';
import { completedMapStops } from '../mapProgress';
import { digits, useApiData } from '../hooks';
import type { AccessEvent, Address, LiveVehicleLocation, Passenger, Route, RoutePassenger, RouteShift, RouteStop, Trip } from '../types';
import type { ScreenProps } from '../pageTypes';

type RoutesData = { routes: Route[]; stops: RouteStop[]; addresses: Address[]; passengers: Passenger[]; assignments: RoutePassenger[]; trips: Trip[]; events: AccessEvent[]; locations: LiveVehicleLocation[] };
type RouteForm = { name: string; description: string; shift: RouteShift; active: boolean };
type AddressForm = { cep: string; rua: string; numero: string; bairro: string; cidade: string; estado: string; complemento: string; latitude: string; longitude: string };
const initialRoute: RouteForm = { name: '', description: '', shift: 'morning', active: true };
const initialAddress: AddressForm = { cep: '', rua: '', numero: '', bairro: '', cidade: 'Marília', estado: 'SP', complemento: '', latitude: '', longitude: '' };

const loadRoutes = async (): Promise<RoutesData> => {
  const [routes, stops, addresses, passengers, assignments, trips, events, locations] = await Promise.all([
    apiFetch<Route[]>('/admin/routes?limit=500'),
    apiFetch<RouteStop[]>('/admin/route-stops?limit=500'),
    apiFetch<Address[]>('/admin/addresses?limit=500'),
    apiFetch<Passenger[]>('/admin/passengers?limit=500'),
    apiFetch<RoutePassenger[]>('/admin/route-passengers?limit=500'),
    apiFetch<Trip[]>('/admin/trips?limit=500'),
    apiFetch<AccessEvent[]>('/admin/access-events?limit=500'),
    apiFetch<LiveVehicleLocation[]>('/admin/vehicle-locations?limit=500'),
  ]);
  return { routes, stops, addresses, passengers, assignments, trips, events, locations };
};

export function RoutesPage({ notify }: ScreenProps) {
  const query = useApiData(loadRoutes, ['routes', 'route_stops', 'addresses', 'passengers', 'route_passengers', 'trips', 'access_events', 'vehicle_locations']);
  const data = query.data;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [routeForm, setRouteForm] = useState<RouteForm>(initialRoute);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [routeModal, setRouteModal] = useState(false);
  const [stopModal, setStopModal] = useState(false);
  const [addressModal, setAddressModal] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>(initialAddress);
  const [stopAddressId, setStopAddressId] = useState('');
  const [passengerId, setPassengerId] = useState('');
  const [passengerStopId, setPassengerStopId] = useState('');
  const [coordinateAddress, setCoordinateAddress] = useState<Address | null>(null);
  const [coordinateForm, setCoordinateForm] = useState({ latitude: '', longitude: '' });
  const [busy, setBusy] = useState(false);
  const routes = data?.routes ?? [];
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0] ?? null;
  const addressById = useMemo(() => new Map((data?.addresses ?? []).map((address) => [address.id, address])), [data]);
  const selectedStops = (data?.stops ?? []).filter((stop) => stop.route_id === selected?.id).sort((a, b) => a.sequence - b.sequence);
  const selectedPassengerLinks = (data?.assignments ?? []).filter((link) => link.route_id === selected?.id && link.active);
  const liveTrip = (data?.trips ?? []).filter((trip) => trip.route_id === selected?.id && trip.status === 'in_progress').sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))[0] ?? null;
  const liveLocation = liveTrip ? data?.locations.find((location) => location.trip_id === liveTrip.id) : undefined;
  const completedStops = completedMapStops(selectedStops, selectedPassengerLinks, data?.events ?? [], liveTrip?.vehicle_id ?? null, liveTrip?.started_at ?? null);
  const stopsCount = data?.stops.length ?? 0;
  const passengerLinks = data?.assignments.filter((link) => link.active).length ?? 0;

  function openRouteForm(route?: Route) {
    setEditingRoute(route ?? null);
    setRouteForm(route ? { name: route.name, description: route.description ?? '', shift: route.shift, active: route.active } : initialRoute);
    setRouteModal(true);
  }

  async function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const route = await apiFetch<Route>(editingRoute ? `/admin/routes/${editingRoute.id}` : '/admin/routes', {
        method: editingRoute ? 'PUT' : 'POST',
        body: JSON.stringify({ ...routeForm, description: routeForm.description || null }),
      });
      setSelectedId(route.id);
      setRouteModal(false);
      await query.reload();
      notify(editingRoute ? 'Rota atualizada.' : 'Rota cadastrada.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível salvar a rota.', 'error'); }
    finally { setBusy(false); }
  }

  async function removeRoute(route: Route) {
    if (!window.confirm(`Excluir a rota ${route.name}?`)) return;
    try {
      await apiFetch<void>(`/admin/routes/${route.id}`, { method: 'DELETE' });
      if (selectedId === route.id) setSelectedId(null);
      await query.reload();
      notify('Rota excluída.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível excluir a rota.', 'error'); }
  }

  async function addStop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !stopAddressId) return;
    setBusy(true);
    try {
      const nextSequence = Math.max(0, ...selectedStops.map((stop) => stop.sequence)) + 1;
      await apiFetch('/admin/route-stops', { method: 'POST', body: JSON.stringify({ route_id: selected.id, address_id: Number(stopAddressId), sequence: nextSequence }) });
      setStopModal(false);
      setStopAddressId('');
      await query.reload();
      notify('Parada adicionada à rota.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível adicionar a parada.', 'error'); }
    finally { setBusy(false); }
  }

  async function removeStop(stop: RouteStop) {
    if (!window.confirm(`Remover a parada ${stop.sequence} desta rota? Os passageiros vinculados ficarão sem parada.`)) return;
    try {
      await apiFetch<void>(`/admin/route-stops/${stop.id}`, { method: 'DELETE' });
      await query.reload();
      notify('Parada removida.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível remover a parada.', 'error'); }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const coordinates = parseCoordinates(addressForm.latitude, addressForm.longitude);
      const address = await apiFetch<Address>('/admin/addresses', { method: 'POST', body: JSON.stringify({ ...addressForm, ...coordinates, cep: digits(addressForm.cep), complemento: addressForm.complemento || null }) });
      setAddressModal(false);
      setAddressForm(initialAddress);
      setStopAddressId(String(address.id));
      await query.reload();
      notify('Endereço cadastrado.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível cadastrar o endereço.', 'error'); }
    finally { setBusy(false); }
  }

  async function addPassenger(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !passengerId) return;
    setBusy(true);
    try {
      const existingLink = (data?.assignments ?? []).find((link) => link.route_id === selected.id && link.passenger_id === Number(passengerId));
      const stop_id = passengerStopId ? Number(passengerStopId) : null;
      if (existingLink) {
        await apiFetch(`/admin/route-passengers/${existingLink.id}`, { method: 'PUT', body: JSON.stringify({ active: true, stop_id }) });
      } else {
        await apiFetch('/admin/route-passengers', { method: 'POST', body: JSON.stringify({ route_id: selected.id, passenger_id: Number(passengerId), stop_id, active: true }) });
      }
      setPassengerId('');
      setPassengerStopId('');
      await query.reload();
      notify('Passageiro associado à rota.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível associar o passageiro.', 'error'); }
    finally { setBusy(false); }
  }

  async function removePassenger(linkId: number) {
    if (!window.confirm('Remover este passageiro da rota?')) return;
    try {
      await apiFetch<void>(`/admin/route-passengers/${linkId}`, { method: 'DELETE' });
      await query.reload();
      notify('Passageiro removido da rota.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível remover o passageiro.', 'error'); }
  }

  async function changePassengerStop(link: RoutePassenger, stopId: string) {
    try {
      await apiFetch(`/admin/route-passengers/${link.id}`, { method: 'PUT', body: JSON.stringify({ stop_id: stopId ? Number(stopId) : null }) });
      await query.reload();
      notify('Parada do passageiro atualizada.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível alterar a parada.', 'error'); }
  }

  async function moveStop(index: number, direction: number) {
    if (!selected) return;
    const next = [...selectedStops];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try {
      await apiFetch(`/admin/routes/${selected.id}/stops/reorder`, { method: 'POST', body: JSON.stringify({ stop_ids: next.map((stop) => stop.id) }) });
      await query.reload();
      notify('Ordem das paradas atualizada.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível ordenar as paradas.', 'error'); }
    finally { setBusy(false); }
  }

  function editCoordinates(address: Address) {
    setCoordinateAddress(address);
    setCoordinateForm({ latitude: address.latitude?.toString() ?? '', longitude: address.longitude?.toString() ?? '' });
  }

  async function saveCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coordinateAddress) return;
    setBusy(true);
    try {
      const coordinates = parseCoordinates(coordinateForm.latitude, coordinateForm.longitude);
      if (coordinates.latitude !== coordinateAddress.latitude || coordinates.longitude !== coordinateAddress.longitude) {
        await apiFetch(`/admin/addresses/${coordinateAddress.id}`, { method: 'PUT', body: JSON.stringify(coordinates) });
        await query.reload();
      }
      setCoordinateAddress(null);
      notify('Coordenadas atualizadas.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível salvar as coordenadas.', 'error'); }
    finally { setBusy(false); }
  }

  const eligiblePassengers = (data?.passengers ?? []).filter((passenger) => !selectedPassengerLinks.some((link) => link.passenger_id === passenger.id));

  return (
    <>
      <PageTitle title="Rotas e Paradas" description="Organize os trajetos, pontos de embarque e destinos." action={<Button onClick={() => openRouteForm()}>＋ Cadastrar rota</Button>} />
      {query.loading && !data ? <LoadingState /> : query.error && !data ? <div className="inline-error">{query.error} <Button variant="plain" onClick={() => void query.reload()}>Tentar novamente</Button></div> : data ? <>
        <div className="summary-grid summary-grid-three">
          <SummaryCard label="ROTAS CADASTRADAS" value={routes.length} detail="Trajetos registrados" icon="⌖" />
          <SummaryCard label="PARADAS CADASTRADAS" value={stopsCount} detail="Pontos de passagem" icon="📍" />
          <SummaryCard label="PASSAGEIROS EM ROTAS" value={passengerLinks} detail="Vínculos ativos" icon="♙" />
        </div>
        <div className="dashboard-grid route-grid">
          <Panel title="Rotas cadastradas" action={<Button onClick={() => openRouteForm()}>＋ Nova rota</Button>}>
            {routes.length ? <div className="route-list">{routes.map((route) => {
              const stops = data.stops.filter((stop) => stop.route_id === route.id).length;
              return <div className={`route-list-row ${selected?.id === route.id ? 'route-list-row-active' : ''}`} key={route.id}>
                <button className="route-select" type="button" onClick={() => setSelectedId(route.id)}><strong>{route.name}</strong><small>{routeShiftLabel(route.shift)} · {stops} {stops === 1 ? 'parada' : 'paradas'} · {route.active ? 'Ativa' : 'Inativa'}</small></button>
                <div className="action-cell"><Button variant="quiet" onClick={() => openRouteForm(route)}>Editar</Button><Button variant="danger" onClick={() => void removeRoute(route)}>Excluir</Button></div>
              </div>;
            })}</div> : <EmptyState title="Nenhuma rota cadastrada" message="Crie uma rota para organizar as paradas e passageiros." action={<Button onClick={() => openRouteForm()}>Cadastrar rota</Button>} />}
          </Panel>
          <Panel title="Mapa da rota selecionada" action={selected ? <Pill tone="warning">{selected.name}</Pill> : undefined}>
            {selected ? <RouteMap routeId={selected.id} stops={selectedStops} addresses={data.addresses} assignments={selectedPassengerLinks} passengers={data.passengers} completedStopIds={completedStops} activeTripId={liveTrip?.id ?? null} locationUpdatedAt={liveLocation?.recorded_at ?? null} /> : <EmptyState title="Selecione uma rota" message="O trajeto e as paradas aparecerão aqui." />}
          </Panel>
        </div>

        <div className="split-grid route-details-grid">
          <Panel title="Cadastro e associação de paradas" subtitle={selected ? `${selected.name} · ${selectedStops.length} paradas` : 'Selecione uma rota'} action={selected ? <Button onClick={() => setStopModal(true)}>＋ Nova parada</Button> : undefined}>
            {selected ? selectedStops.length ? <div className="stop-list">{selectedStops.map((stop, index) => {
              const address = addressById.get(stop.address_id);
              const linked = selectedPassengerLinks.filter((link) => link.stop_id === stop.id).length;
              return <div className="stop-row" key={stop.id}><span className="stop-number">{String(stop.sequence).padStart(2, '0')}</span><div><strong>{formatAddress(address)}</strong><small>{linked} aluno(s) · {address?.latitude == null || address.longitude == null ? 'sem coordenadas' : address.coordinate_source === 'demo' ? 'posição simulada' : 'posição informada'}</small></div><div className="stop-actions"><Button variant="quiet" aria-label={`Subir parada ${stop.sequence}`} disabled={busy || index === 0} onClick={() => void moveStop(index, -1)}>↑</Button><Button variant="quiet" aria-label={`Descer parada ${stop.sequence}`} disabled={busy || index === selectedStops.length - 1} onClick={() => void moveStop(index, 1)}>↓</Button>{address ? <Button variant="quiet" onClick={() => editCoordinates(address)}>Localizar</Button> : null}<Button variant="danger" onClick={() => void removeStop(stop)}>Remover</Button></div></div>;
            })}</div> : <EmptyState title="Rota sem paradas" message="Adicione endereços para registrar os pontos de passagem." action={<Button onClick={() => setStopModal(true)}>Adicionar parada</Button>} /> : <EmptyState title="Nenhuma rota selecionada" message="Cadastre uma rota para configurar as paradas." />}
          </Panel>
          <Panel title="Passageiros vinculados" subtitle={selected ? `${selectedPassengerLinks.length} alunos associados a esta rota` : 'Selecione uma rota'}>
            {selected ? <>
              {eligiblePassengers.length ? <form className="route-passenger-form" onSubmit={(event) => void addPassenger(event)}><SelectInput value={passengerId} onChange={(event) => { const value = event.target.value; setPassengerId(value); const passenger = data.passengers.find((item) => item.id === Number(value)); setPassengerStopId(String(selectedStops.find((stop) => stop.address_id === passenger?.addresses_id)?.id ?? '')); }} required><option value="">Selecionar passageiro</option>{eligiblePassengers.map((passenger) => <option value={passenger.id} key={passenger.id}>{passenger.name}</option>)}</SelectInput><SelectInput aria-label="Parada de embarque" value={passengerStopId} onChange={(event) => setPassengerStopId(event.target.value)}><option value="">Sem parada definida</option>{selectedStops.map((stop) => <option value={stop.id} key={stop.id}>{stop.sequence} · {formatAddress(addressById.get(stop.address_id))}</option>)}</SelectInput><Button type="submit" loading={busy}>Associar</Button></form> : <p className="panel-hint">Todos os passageiros disponíveis já estão associados.</p>}
              {selectedPassengerLinks.length ? <div className="assigned-list">{selectedPassengerLinks.map((link) => { const passenger = data.passengers.find((item) => item.id === link.passenger_id); return <div key={link.id}><span>{passenger?.name || `Passageiro ${link.passenger_id}`}</span><SelectInput aria-label={`Parada de ${passenger?.name || link.passenger_id}`} value={link.stop_id ?? ''} onChange={(event) => void changePassengerStop(link, event.target.value)}><option value="">Sem parada</option>{selectedStops.map((stop) => <option value={stop.id} key={stop.id}>{stop.sequence} · {formatAddress(addressById.get(stop.address_id))}</option>)}</SelectInput><Button variant="danger" onClick={() => void removePassenger(link.id)}>Remover</Button></div>; })}</div> : <small className="muted-copy">Ainda não há passageiros vinculados.</small>}
            </> : <EmptyState title="Selecione uma rota" message="Os passageiros vinculados aparecerão aqui." />}
          </Panel>
        </div>
      </> : null}

      {routeModal ? <Modal title={editingRoute ? 'Editar rota' : 'Cadastrar rota'} eyebrow={editingRoute ? `ROTA #${editingRoute.id}` : 'NOVO TRAJETO'} onClose={() => setRouteModal(false)} onSubmit={(event) => void saveRoute(event)} submitLabel="Salvar rota" busy={busy}>
        <div className="form-grid">
          <Field label="Nome da rota" className="field-span-two"><TextInput value={routeForm.name} onChange={(event) => setRouteForm({ ...routeForm, name: event.target.value })} maxLength={100} placeholder="Rota da Manhã - UNIMAR" required /></Field>
          <Field label="Turno"><SelectInput value={routeForm.shift} onChange={(event) => setRouteForm({ ...routeForm, shift: event.target.value as RouteShift })}><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="evening">Noite</option></SelectInput></Field>
          <Field label="Situação"><SelectInput value={routeForm.active ? 'true' : 'false'} onChange={(event) => setRouteForm({ ...routeForm, active: event.target.value === 'true' })}><option value="true">Ativa</option><option value="false">Inativa</option></SelectInput></Field>
          <Field label="Descrição" className="field-span-two"><TextInput value={routeForm.description} onChange={(event) => setRouteForm({ ...routeForm, description: event.target.value })} maxLength={255} placeholder="Escola ou informação de referência" /></Field>
        </div>
      </Modal> : null}

      {stopModal ? <Modal title="Adicionar parada" eyebrow={selected?.name || 'ROTA'} onClose={() => setStopModal(false)} onSubmit={(event) => void addStop(event)} submitLabel="Adicionar parada" busy={busy}>
        <Field label="Endereço da parada"><SelectInput value={stopAddressId} onChange={(event) => setStopAddressId(event.target.value)} required><option value="">Selecionar endereço</option>{(data?.addresses ?? []).filter((address) => !selectedStops.some((stop) => stop.address_id === address.id)).map((address) => <option value={address.id} key={address.id}>{formatAddress(address)}</option>)}</SelectInput></Field>
        <Button type="button" variant="plain" onClick={() => setAddressModal(true)}>＋ Cadastrar endereço</Button>
        <p className="panel-hint">Ordem de parada: {Math.max(0, ...selectedStops.map((stop) => stop.sequence)) + 1}</p>
      </Modal> : null}

      {addressModal ? <Modal title="Cadastrar endereço" eyebrow="NOVO ENDEREÇO" onClose={() => setAddressModal(false)} onSubmit={(event) => void addAddress(event)} submitLabel="Salvar endereço" busy={busy} wide>
        <div className="form-grid">
          <Field label="CEP"><TextInput value={addressForm.cep} onChange={(event) => setAddressForm({ ...addressForm, cep: event.target.value })} maxLength={10} required /></Field><Field label="Estado"><TextInput value={addressForm.estado} onChange={(event) => setAddressForm({ ...addressForm, estado: event.target.value.toUpperCase() })} maxLength={2} required /></Field>
          <Field label="Rua" className="field-span-two"><TextInput value={addressForm.rua} onChange={(event) => setAddressForm({ ...addressForm, rua: event.target.value })} maxLength={150} required /></Field><Field label="Número"><TextInput value={addressForm.numero} onChange={(event) => setAddressForm({ ...addressForm, numero: event.target.value })} maxLength={20} required /></Field><Field label="Bairro"><TextInput value={addressForm.bairro} onChange={(event) => setAddressForm({ ...addressForm, bairro: event.target.value })} maxLength={100} required /></Field><Field label="Cidade"><TextInput value={addressForm.cidade} onChange={(event) => setAddressForm({ ...addressForm, cidade: event.target.value })} maxLength={100} required /></Field><Field label="Complemento"><TextInput value={addressForm.complemento} onChange={(event) => setAddressForm({ ...addressForm, complemento: event.target.value })} maxLength={150} /></Field>
          <CoordinatesEditor latitude={addressForm.latitude} longitude={addressForm.longitude} onChange={(latitude, longitude) => setAddressForm({ ...addressForm, latitude, longitude })} />
        </div>
      </Modal> : null}

      {coordinateAddress ? <Modal title="Localizar parada" eyebrow={formatAddress(coordinateAddress)} onClose={() => setCoordinateAddress(null)} onSubmit={(event) => void saveCoordinates(event)} submitLabel="Salvar coordenadas" busy={busy} wide>
        <CoordinatesEditor latitude={coordinateForm.latitude} longitude={coordinateForm.longitude} onChange={(latitude, longitude) => setCoordinateForm({ latitude, longitude })} />
      </Modal> : null}
    </>
  );
}
