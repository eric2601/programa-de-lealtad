import { useEffect, useState } from 'react';
import { pesos } from '../../api';
import { useT } from '../../i18n';
import { useAdmin } from '../AdminPanel';
import { adminApi, errorText, fmtNum, type Campaign, type Partner, type PromotionInput, type PromotionView } from '../api';
import { Empty, ErrorBox, Head, InventoryBar, Loading, StatusPill, useLoad, vigencia } from '../ui';
import { PromoDetail } from './PromoDetail';
import { PromoEditor } from './PromoEditor';
import { artFor, POSTERS } from '../../promoArt';

type Mode = { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'new'; campaignId: string | null } | { kind: 'edit'; id: string; initial: PromotionInput };

export function Promociones() {
  const { t } = useT();
  const { token, takeFocus, go } = useAdmin();
  const [status, setStatus] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [saved, setSaved] = useState<PromotionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const promos = useLoad(() => adminApi<PromotionView[]>('/promotions', token), [token]);
  const campaigns = useLoad(() => adminApi<Campaign[]>('/campaigns', token), [token]);
  const partners = useLoad(() => adminApi<Partner[]>('/partners', token), [token]);

  useEffect(() => {
    const f = takeFocus();
    if (!f) return;
    if (f.startsWith('new:')) setMode({ kind: 'new', campaignId: f.slice(4) || null }); else setMode({ kind: 'detail', id: f });
  }, [takeFocus]);

  async function changeStatus(id: string, s: 'active' | 'paused' | 'ended') {
    setBusy(true); setActionError(null);
    try { await adminApi(`/promotions/${id}`, token, { method: 'PATCH', body: { status: s } }); promos.reload(); }
    catch (e) { setActionError(errorText(e)); } finally { setBusy(false); }
  }

  if (mode.kind === 'detail') return <PromoDetail id={mode.id} busy={busy} onBack={() => setMode({ kind: 'list' })} onStatus={changeStatus} onEdit={(p) => setMode({ kind: 'edit', id: p.id, initial: p })} />;
  if (mode.kind === 'new' || mode.kind === 'edit') {
    return (
      <PromoEditor
        initial={mode.kind === 'edit' ? mode.initial : { campaignId: mode.campaignId }}
        promotionId={mode.kind === 'edit' ? mode.id : null}
        campaigns={campaigns.data ?? []} promotions={promos.data ?? []} partners={partners.data ?? []}
        onCancel={() => setMode(mode.kind === 'edit' ? { kind: 'detail', id: mode.id } : { kind: 'list' })}
        onSaved={(p) => { setSaved(p); promos.reload(); setMode({ kind: 'list' }); }}
      />
    );
  }

  if (promos.error) return <><Head title={t('Promociones')} /><ErrorBox text={promos.error} onRetry={promos.reload} /></>;
  if (!promos.data) return <><Head title={t('Promociones')} /><Loading /></>;
  const list = promos.data.filter((p) => (!status || p.status === status) && (!campaignId || (campaignId === 'none' ? !p.campaignId : p.campaignId === campaignId)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const campaignName = (id: string | null) => campaigns.data?.find((c) => c.id === id)?.name ?? null;

  return (
    <div className={`admin-main${promos.loading ? ' dim' : ''}`}>
      <Head title={t('Promociones')} sub={t('Cada promoción define condición, beneficio, restricciones, límites y existencias.')}
        desc={t('Una promoción es una regla sencilla: “si el cliente hace X, recibe Y”. Aquí las creas, las activas o pausas y ves cuántas veces se han usado.')}>
        <button className="btn primary" onClick={() => setMode({ kind: 'new', campaignId: null })}>{t('Nueva promoción')}</button>
      </Head>
      {actionError && <div className="alert error">{actionError}</div>}
      {saved && (
        <div className="card accent">
          <div className="row between"><h3>{t('Promoción guardada:')} {saved.name}</h3><div className="row"><button className="btn sm primary" onClick={() => { setMode({ kind: 'detail', id: saved.id }); setSaved(null); }}>{t('Ver detalle')}</button><button className="btn sm" onClick={() => setSaved(null)}>{t('Cerrar')}</button></div></div>
          <p style={{ margin: 0 }}><b>{saved.condition}</b></p>
          <div className="grid-2">
            <div><h3>{t('Restricciones generadas')}</h3><ul className="restr">{saved.restrictions.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
            <div><h3>{t('Términos y condiciones')}</h3><div className="terms">{saved.terms}</div></div>
          </div>
        </div>
      )}
      <div className="card">
        <div className="row between"><div className="section-title"><h3>{t('Vista previa del material gráfico')}</h3><p>{t('Diez carteles listos para imprimir o publicar. Cada promoción muestra el suyo en la lista y en su detalle.')}</p></div><span className="muted small">{t('{n} carteles', { n: POSTERS.length })}</span></div>
        <div className="poster-gallery">
          {POSTERS.map((a, i) => <figure key={a.file}><img src={a.file} alt={a.title} loading="lazy" /><figcaption><b>{String(i + 1).padStart(2, '0')}</b> {a.title}</figcaption></figure>)}
        </div>
      </div>
      <div className="card">
        <div className="filters">
          <label className="field">{t('Buscar')}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Nombre de la promoción')} /></label>
          <label className="field">{t('Estado')}<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('Todos')}</option><option value="draft">{t('Borrador')}</option><option value="active">{t('Activa')}</option><option value="paused">{t('Pausada')}</option><option value="exhausted">{t('Agotada')}</option><option value="ended">{t('Terminada')}</option></select></label>
          <label className="field">{t('Campaña')}<select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">{t('Todas')}</option><option value="none">{t('Sin campaña')}</option>{(campaigns.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <span className="muted small">{t('{shown} de {total}', { shown: list.length, total: promos.data.length })}</span>
        </div>
      </div>
      {list.length === 0 && (promos.data.length === 0
        ? <Empty icon="tag" title={t('Todavía no hay promociones')} text={t('Crea la primera o pide ideas al generador.')} action={<><button className="btn sm primary" onClick={() => setMode({ kind: 'new', campaignId: null })}>{t('Nueva promoción')}</button><button className="btn sm" onClick={() => go('generador')}>{t('Ver ideas')}</button></>} />
        : <Empty icon="search" title={t('No hay promociones con esos filtros')} text={t('Prueba con otro estado, campaña o nombre.')} />)}
      <div className="list">
        {list.map((p) => (
          <div key={p.id} className="item promo-item">
            <img className="promo-thumb" src={artFor(p).file} alt="" loading="lazy" onClick={() => setMode({ kind: 'detail', id: p.id })} />
            <div className="grow" style={{ display: 'grid', gap: '.5rem', minWidth: 0 }}>
            <div className="row between">
              <div className="row"><button className="link title" onClick={() => setMode({ kind: 'detail', id: p.id })}>{p.name}</button><StatusPill status={p.status} />{p.endsSoon && <span className="pill warn">{t('Vence pronto')}</span>}{p.inventory.exhausted && <span className="pill crit">{t('Agotada')}</span>}</div>
              <div className="actions">
                {(p.status === 'draft' || p.status === 'paused') && <button className="btn sm" disabled={busy} onClick={() => changeStatus(p.id, 'active')}>{t('Activar')}</button>}
                {p.status === 'active' && <button className="btn sm" disabled={busy} onClick={() => changeStatus(p.id, 'paused')}>{t('Pausar')}</button>}
                {p.status !== 'ended' && <button className="btn sm danger" disabled={busy} onClick={() => { if (confirm(t('¿Terminar "{name}"?', { name: p.name }))) changeStatus(p.id, 'ended'); }}>{t('Terminar')}</button>}
                <button className="btn sm" onClick={() => setMode({ kind: 'edit', id: p.id, initial: p })}>{t('Editar')}</button>
              </div>
            </div>
            <div className="small">{p.condition}</div>
            <div className="meta">
              <span>{t('Tipo:')} <b style={{ fontFamily: 'var(--sans)' }}>{p.typeLabel}</b></span>
              <span>{p.stackable ? t('Acumulable') : t('No acumulable')}</span>
              <span>{t('Prioridad:')} <b>{p.priority}</b></span>
              <span>{t('Usos:')} <b>{fmtNum(p.usage.uses)}</b> · {t('costo')} <b>{pesos(p.usage.costCents)}</b></span>
              <span>{t('Vigencia:')} <b>{vigencia(p.rules.startsAt, p.rules.endsAt)}</b></span>
              {p.campaignId && <span>{t('Campaña:')} <b style={{ fontFamily: 'var(--sans)' }}>{campaignName(p.campaignId) ?? '—'}</b></span>}
            </div>
            <InventoryBar inv={p.inventory} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
