import type {
  ButtonHTMLAttributes,
  FormHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import type { NoticeMessage } from './types';

export function Button({ children, variant = 'yellow', loading = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'yellow' | 'quiet' | 'danger' | 'plain'; loading?: boolean }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props} disabled={loading || props.disabled} type={props.type || 'button'}>
      {loading ? <span className="spinner" aria-hidden="true" /> : null}{children}
    </button>
  );
}

export function PageTitle({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1><p>{description}</p></div>
      {action ? <div className="page-heading-action">{action}</div> : null}
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title || subtitle || action ? (
        <div className="panel-heading">
          <div>{title ? <h2>{title}</h2> : null}{subtitle ? <p>{subtitle}</p> : null}</div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SummaryCard({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: string }) {
  return (
    <div className="summary-card">
      <div className="summary-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
      <div className="summary-icon" aria-hidden="true">{icon}</div>
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'blue' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}

export function Modal({ title, eyebrow, onClose, children, onSubmit, submitLabel, busy = false, wide = false }: {
  title: string; eyebrow?: string; onClose: () => void; children: ReactNode;
  onSubmit?: FormHTMLAttributes<HTMLFormElement>['onSubmit']; submitLabel?: string; busy?: boolean; wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2>{title}</h2></div>
          <button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </header>
        {onSubmit ? (
          <form onSubmit={onSubmit}>
            <div className="modal-body">{children}</div>
            <footer className="modal-footer"><Button type="button" variant="quiet" onClick={onClose}>Cancelar</Button><Button type="submit" loading={busy}>{submitLabel || 'Salvar'}</Button></footer>
          </form>
        ) : <div className="modal-body">{children}</div>}
      </section>
    </div>
  );
}

export function Notice({ notice, onDismiss }: { notice: NoticeMessage | null; onDismiss?: () => void }) {
  if (!notice) return null;
  return <div className={`notice notice-${notice.tone}`} role="status"><span>{notice.message}</span>{onDismiss ? <button type="button" aria-label="Fechar aviso" onClick={onDismiss}>×</button> : null}</div>;
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon" aria-hidden="true">⌕</div><strong>{title}</strong><p>{message}</p>{action}</div>;
}

export function LoadingState({ label = 'Carregando dados da API…' }: { label?: string }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="table-wrap"><table className="data-table">{children}</table></div>;
}

export function Pagination({ page, pages, onChange, count, noun }: { page: number; pages: number; onChange: (page: number) => void; count: number; noun: string }) {
  if (pages <= 1) return <div className="table-footer">Exibindo {count} {noun}</div>;
  return (
    <div className="table-footer">
      <span>Exibindo {count} {noun}</span>
      <div className="pagination">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">‹</button>
        <span>{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página">›</button>
      </div>
    </div>
  );
}

export function MapArtwork({ markers = 3, label = 'Representação esquemática do trajeto' }: { markers?: number; label?: string }) {
  return (
    <div className="map-artwork" aria-label={label} role="img">
      <div className="map-road map-road-one" />
      <div className="map-road map-road-two" />
      <div className="map-route-line" />
      {Array.from({ length: markers }, (_, index) => <span className={`map-pin map-pin-${index + 1}`} key={index}>📍</span>)}
      <span className="map-bus">🚌</span>
      <span className="map-caption">{label}</span>
    </div>
  );
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(date);
}

export function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatAddress(address?: { rua: string; numero: string; bairro: string; cidade: string; estado: string } | null) {
  if (!address) return 'Endereço não informado';
  return `${address.rua}, ${address.numero} · ${address.bairro} · ${address.cidade}/${address.estado}`;
}

export function routeShiftLabel(value: string) {
  return ({ morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite' } as Record<string, string>)[value] || value;
}

export function tripStatusLabel(value: string) {
  return ({ scheduled: 'Programada', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' } as Record<string, string>)[value] || value;
}

export function tripStatusTone(value: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (value === 'in_progress' || value === 'completed') return 'success';
  if (value === 'scheduled') return 'warning';
  if (value === 'cancelled') return 'danger';
  return 'neutral';
}

export function roleLabel(value: string) {
  return ({ admin: 'Administrador', driver: 'Motorista', supervisor: 'Supervisor', responsible: 'Responsável' } as Record<string, string>)[value] || value;
}
