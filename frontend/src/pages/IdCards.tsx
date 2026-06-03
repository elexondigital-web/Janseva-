import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAuthStore } from '../store/auth.store';
import {
  peopleApi,
  type PersonListItem,
} from '../api/people.api';
import {
  idCardsApi,
  type IdCardDetail,
} from '../api/idcards.api';
import {
  blocksApi,
  wardsApi,
  boothsApi,
  type BlockWithCount,
  type WardWithCount,
  type BoothWithCount,
} from '../api/hierarchy.api';
import { AdminRole } from '../types';
import IdCard from '../components/IdCard';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  IconSearch,
  IconUser,
  IconX,
  IconPrinter,
  IconDownload,
  IconLayers,
  IconCheckCircle,
  IconAlertTriangle,
} from '../components/ui/Icon';

const DEBOUNCE_MS = 300;

// A4 sheet layout: 2 cols x 3 rows = 6 cards/page. Dimensions in mm.
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 54;
const COLS = 2;
const ROWS = 3;
const MARGIN_X_MM = (A4_WIDTH_MM - COLS * CARD_WIDTH_MM) / (COLS + 1); // 12.9
const MARGIN_Y_MM = (A4_HEIGHT_MM - ROWS * CARD_HEIGHT_MM) / (ROWS + 1); // 33.75
const CARDS_PER_PAGE = COLS * ROWS;

export default function IdCards() {
  const user = useAuthStore((s) => s.user);
  usePageTitle('ID Cards');
  const [searchParams, setSearchParams] = useSearchParams();

  // -------- PREVIEW PANE STATE --------
  const [personInput, setPersonInput] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PersonListItem[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonListItem | null>(
    null,
  );
  const [previewCard, setPreviewCard] = useState<IdCardDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // -------- BULK PANE STATE --------
  const [bulkBlockId, setBulkBlockId] = useState(user?.blockId ?? '');
  const [bulkWardId, setBulkWardId] = useState(user?.wardId ?? '');
  const [bulkBoothId, setBulkBoothId] = useState(user?.boothId ?? '');
  const [bulkAutoIssue, setBulkAutoIssue] = useState(false);
  const [bulkBlocks, setBulkBlocks] = useState<BlockWithCount[]>([]);
  const [bulkWards, setBulkWards] = useState<WardWithCount[]>([]);
  const [bulkBooths, setBulkBooths] = useState<BoothWithCount[]>([]);
  const [bulkPreviewCount, setBulkPreviewCount] = useState<number | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);

  // Hidden stage for bulk rendering (off-screen div of <IdCard> instances
  // that html2canvas rasterizes one at a time).
  const bulkStageRef = useRef<HTMLDivElement | null>(null);
  const [bulkCardsToRender, setBulkCardsToRender] = useState<IdCardDetail[]>([]);

  // -------- DEEP-LINK: ?personId=xxx --------
  useEffect(() => {
    const pid = searchParams.get('personId');
    if (pid && pid !== selectedPerson?.id) {
      (async () => {
        try {
          const detail = await peopleApi.get(pid);
          setSelectedPerson({
            id: detail.id,
            uniqueId: detail.uniqueId,
            fullName: detail.fullName,
            fatherName: detail.fatherName,
            phone: detail.phone,
            dob: detail.dob,
            gender: detail.gender,
            whatsapp: detail.whatsapp,
            email: detail.email,
            aadhaarNumber: detail.aadhaarNumber,
            voterId: detail.voterId,
            address: detail.address,
            pincode: detail.pincode,
            occupation: detail.occupation,
            caste: detail.caste,
            category: detail.category,
            photoUrl: detail.photoUrl,
            aadhaarImageUrl: detail.aadhaarImageUrl,
            role: detail.role,
            status: detail.status,
            boothId: detail.boothId,
            wardId: detail.wardId,
            blockId: detail.blockId,
            createdAt: detail.createdAt,
            updatedAt: detail.updatedAt,
            block: detail.block,
            ward: detail.ward,
            booth: detail.booth,
            idCard: detail.idCard
              ? {
                  id: detail.idCard.id,
                  uniqueCardId: detail.idCard.uniqueCardId,
                  issuedAt: detail.idCard.issuedAt,
                }
              : null,
          });
        } catch {
          toast.error('Could not load the linked person');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // -------- DEBOUNCED PERSON SEARCH --------
  useEffect(() => {
    const t = window.setTimeout(() => setPersonQuery(personInput.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [personInput]);

  useEffect(() => {
    if (!personQuery) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await peopleApi.search({ q: personQuery, limit: 5 });
        if (!cancelled) setSuggestions(res.items);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personQuery]);

  // -------- LOAD CARD when person selected --------
  useEffect(() => {
    if (!selectedPerson) {
      setPreviewCard(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      try {
        const c = await idCardsApi.getFull(selectedPerson.id);
        if (!cancelled) setPreviewCard(c);
      } catch (err: any) {
        if (!cancelled) {
          setPreviewCard(null);
          // 404 just means no card yet — that's a normal state, not an error
          if (err?.response?.status !== 404) {
            toast.error(err?.response?.data?.message ?? 'Failed to load card');
          }
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPerson]);

  async function onIssueCard() {
    if (!selectedPerson) return;
    setIssuing(true);
    try {
      const c = await idCardsApi.issue(selectedPerson.id);
      setPreviewCard(c);
      toast.success('ID card issued');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to issue card');
    } finally {
      setIssuing(false);
    }
  }

  function onSelectSuggestion(p: PersonListItem) {
    setSelectedPerson(p);
    setPersonInput(p.fullName);
    setShowSuggest(false);
    setSearchParams({ personId: p.id }, { replace: true });
  }

  function onClearPerson() {
    setSelectedPerson(null);
    setPersonInput('');
    setPersonQuery('');
    setPreviewCard(null);
    setSearchParams({}, { replace: true });
  }

  async function onDownloadSinglePdf() {
    if (!previewCard) return;
    const el = document.querySelector<HTMLDivElement>(
      '[data-card-id="' + previewCard.uniqueCardId + '"]',
    );
    if (!el) {
      toast.error('Card element not found');
      return;
    }
    setDownloading(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [CARD_WIDTH_MM, CARD_HEIGHT_MM],
      });
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        0,
        CARD_WIDTH_MM,
        CARD_HEIGHT_MM,
      );
      pdf.save(`${previewCard.person.uniqueId}.pdf`);
    } catch (err: any) {
      toast.error('PDF export failed: ' + (err?.message ?? 'unknown'));
    } finally {
      setDownloading(false);
    }
  }

  // -------- BULK: LOAD FILTER DROPDOWNS --------
  useEffect(() => {
    (async () => {
      try {
        if (user?.role === AdminRole.SUPER_ADMIN) {
          setBulkBlocks(await blocksApi.list());
        } else if (user?.role === AdminRole.BLOCK_ADMIN) {
          setBulkWards(await wardsApi.list());
        } else if (user?.role === AdminRole.WARD_ADMIN) {
          setBulkBooths(await boothsApi.list());
        }
      } catch {
        // ignore
      }
    })();
  }, [user]);

  useEffect(() => {
    if (user?.role !== AdminRole.SUPER_ADMIN) return;
    if (!bulkBlockId) {
      setBulkWards([]);
      setBulkWardId('');
      setBulkBooths([]);
      setBulkBoothId('');
      return;
    }
    (async () => {
      try {
        setBulkWards(await wardsApi.list(bulkBlockId));
      } catch {
        setBulkWards([]);
      }
    })();
  }, [bulkBlockId, user]);

  useEffect(() => {
    if (!bulkWardId) {
      if (user?.role !== AdminRole.WARD_ADMIN) {
        setBulkBooths([]);
        setBulkBoothId('');
      }
      return;
    }
    (async () => {
      try {
        setBulkBooths(await boothsApi.list({ wardId: bulkWardId }));
      } catch {
        setBulkBooths([]);
      }
    })();
  }, [bulkWardId, user]);

  // Debounced preview count (doesn't fetch all cards, just a count via /people?limit=1)
  const bulkCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!bulkBlockId) {
      setBulkPreviewCount(null);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        const res = await peopleApi.list({
          blockId: bulkBlockId,
          wardId: bulkWardId || undefined,
          boothId: bulkBoothId || undefined,
          limit: 1,
        });
        setBulkPreviewCount(res.total);
        bulkCountRef.current = res.total;
      } catch {
        setBulkPreviewCount(null);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [bulkBlockId, bulkWardId, bulkBoothId]);

  const canRunBulk = useMemo(
    () => Boolean(bulkBlockId) && !bulkRunning,
    [bulkBlockId, bulkRunning],
  );

  async function onGenerateSheet() {
    if (!bulkBlockId) return;
    setBulkRunning(true);
    setBulkProgress({ current: 0, total: 0, message: 'Fetching cards…' });
    try {
      const res = await idCardsApi.bulk({
        blockId: bulkBlockId,
        wardId: bulkWardId || undefined,
        boothId: bulkBoothId || undefined,
        autoIssue: bulkAutoIssue,
      });

      if (res.cards.length === 0) {
        toast.error('No active cards found in this selection.');
        return;
      }

      toast.success(
        `${res.cards.length} cards loaded · ${res.issuedCount} newly issued · ${res.skippedCount} skipped`,
      );

      // Mount the cards into the hidden stage so html2canvas can read them.
      setBulkCardsToRender(res.cards);
      // Wait one frame for React + images to mount.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      // Give external images (photos) a short window to fully load. This is
      // a best-effort wait — html2canvas with useCORS will still render
      // even if a photo is missing.
      await new Promise((r) => window.setTimeout(r, 400));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      setBulkProgress({
        current: 0,
        total: res.cards.length,
        message: 'Rendering cards…',
      });

      const stage = bulkStageRef.current;
      if (!stage) throw new Error('Hidden stage not mounted');

      const cardNodes = Array.from(
        stage.querySelectorAll<HTMLDivElement>('[data-bulk-card]'),
      );
      for (let i = 0; i < cardNodes.length; i++) {
        const node = cardNodes[i];
        const canvas = await html2canvas(node, {
          scale: 2.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/png');

        const pageIndex = Math.floor(i / CARDS_PER_PAGE);
        const slot = i % CARDS_PER_PAGE;
        const col = slot % COLS;
        const row = Math.floor(slot / COLS);

        if (slot === 0 && pageIndex > 0) pdf.addPage();

        const x = MARGIN_X_MM + col * (CARD_WIDTH_MM + MARGIN_X_MM);
        const y = MARGIN_Y_MM + row * (CARD_HEIGHT_MM + MARGIN_Y_MM);
        pdf.addImage(imgData, 'PNG', x, y, CARD_WIDTH_MM, CARD_HEIGHT_MM);

        // Dashed cut guide around each card.
        pdf.setDrawColor(200);
        pdf.setLineDashPattern([1, 1], 0);
        pdf.rect(x, y, CARD_WIDTH_MM, CARD_HEIGHT_MM);
        pdf.setLineDashPattern([], 0);

        setBulkProgress({
          current: i + 1,
          total: cardNodes.length,
          message: `Rendering ${i + 1} of ${cardNodes.length}…`,
        });
      }

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      pdf.save(`janseva-cards-${today}.pdf`);
      toast.success('PDF downloaded');
    } catch (err: any) {
      toast.error('Bulk PDF failed: ' + (err?.message ?? err?.response?.data?.message ?? 'unknown'));
    } finally {
      setBulkCardsToRender([]);
      setBulkProgress(null);
      setBulkRunning(false);
    }
  }

  // -------- HELPERS --------
  const onInputFocus = useCallback(() => setShowSuggest(true), []);
  const onInputBlur = useCallback(
    () => window.setTimeout(() => setShowSuggest(false), 150),
    [],
  );

  return (
    <div className="min-h-screen bg-surface px-6 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-navy tracking-tight">
            ID Cards
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Preview and print individual cards, or generate an A4 sheet of 6
            cards per page for bulk distribution.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ============ PREVIEW (left, 2/3) ============ */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-border rounded shadow-card p-5">
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
                Single card
              </h2>

              {/* Person search */}
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                  <IconSearch size={16} />
                </span>
                <input
                  type="search"
                  value={personInput}
                  onChange={(e) => {
                    setPersonInput(e.target.value);
                    setShowSuggest(true);
                  }}
                  onFocus={onInputFocus}
                  onBlur={onInputBlur}
                  placeholder="Search member by name, phone, ID…"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary"
                />
                {personInput && (
                  <button
                    type="button"
                    onClick={onClearPerson}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-navy"
                    aria-label="Clear"
                  >
                    <IconX size={14} />
                  </button>
                )}

                {/* Suggestions */}
                {showSuggest && suggestions.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded shadow-lg overflow-hidden">
                    {suggestions.map((p) => (
                      <li
                        key={p.id}
                        onMouseDown={() => onSelectSuggestion(p)}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-surface-subtle flex items-center gap-2"
                      >
                        <div className="w-6 h-6 shrink-0 rounded-full bg-surface-subtle border border-border overflow-hidden flex items-center justify-center text-text-muted">
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <IconUser size={10} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-navy truncate">
                            {p.fullName}
                          </div>
                          <div className="text-[11px] text-text-muted font-mono">
                            {p.uniqueId} · {p.phone}
                          </div>
                        </div>
                        {p.idCard && (
                          <span className="text-[10px] text-status-green font-semibold inline-flex items-center gap-1 shrink-0">
                            <IconCheckCircle size={10} />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Preview */}
              {!selectedPerson ? (
                <div className="py-12 flex flex-col items-center text-text-muted">
                  <IconUser size={32} />
                  <div className="mt-3 text-sm">
                    Search and pick a member to preview their card.
                  </div>
                </div>
              ) : previewLoading ? (
                <div className="py-12 text-center text-text-muted text-sm">
                  Loading card…
                </div>
              ) : previewCard ? (
                <div className="flex flex-col md:flex-row gap-5 items-start">
                  <IdCard card={previewCard} />
                  <div className="flex-1 space-y-2 w-full md:w-auto">
                    <button
                      onClick={() => window.print()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-navy text-white rounded hover:bg-navy-light transition-colors"
                    >
                      <IconPrinter size={14} /> Print card
                    </button>
                    <button
                      onClick={onDownloadSinglePdf}
                      disabled={downloading}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
                    >
                      <IconDownload size={14} />
                      {downloading ? 'Generating…' : 'Download PDF'}
                    </button>
                    <div className="text-[11px] text-text-secondary pt-2 leading-relaxed">
                      Card dimensions: 85.6 mm × 54 mm (ISO/IEC 7810 ID-1).
                      PDF export uses the same physical size.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-status-amber-bg text-status-amber flex items-center justify-center">
                    <IconAlertTriangle size={20} />
                  </div>
                  <div className="mt-3 text-sm text-navy font-semibold">
                    {selectedPerson.fullName} has no ID card yet.
                  </div>
                  <button
                    onClick={onIssueCard}
                    disabled={issuing}
                    className="mt-3 px-4 py-2 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
                  >
                    {issuing ? 'Issuing…' : 'Issue card now'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ============ BULK (right, 1/3) ============ */}
          <div className="space-y-4">
            <div className="bg-white border border-border rounded shadow-card p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy uppercase tracking-wide mb-3">
                <IconLayers size={14} /> Bulk A4 sheet
              </h2>

              {user?.role === AdminRole.SUPER_ADMIN && (
                <FilterSelect
                  label="Block"
                  value={bulkBlockId}
                  onChange={(v) => {
                    setBulkBlockId(v);
                    setBulkWardId('');
                    setBulkBoothId('');
                  }}
                  options={[
                    { value: '', label: 'Select block' },
                    ...bulkBlocks.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              )}

              {(user?.role === AdminRole.SUPER_ADMIN ||
                user?.role === AdminRole.BLOCK_ADMIN) && (
                <FilterSelect
                  label="Ward (optional)"
                  value={bulkWardId}
                  onChange={(v) => {
                    setBulkWardId(v);
                    setBulkBoothId('');
                  }}
                  options={[
                    { value: '', label: 'All wards in block' },
                    ...bulkWards.map((w) => ({ value: w.id, label: w.name })),
                  ]}
                  disabled={user?.role === AdminRole.SUPER_ADMIN && !bulkBlockId}
                />
              )}

              {(user?.role === AdminRole.SUPER_ADMIN ||
                user?.role === AdminRole.BLOCK_ADMIN ||
                user?.role === AdminRole.WARD_ADMIN) && (
                <FilterSelect
                  label="Booth (optional)"
                  value={bulkBoothId}
                  onChange={setBulkBoothId}
                  options={[
                    { value: '', label: 'All booths in ward' },
                    ...bulkBooths.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  disabled={!bulkWardId && user?.role !== AdminRole.WARD_ADMIN}
                />
              )}

              <label className="flex items-start gap-2 mt-3 cursor-pointer text-xs text-navy">
                <input
                  type="checkbox"
                  checked={bulkAutoIssue}
                  onChange={(e) => setBulkAutoIssue(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  Issue cards for members who don't have one yet.
                  <span className="block text-text-muted text-[11px] mt-0.5">
                    Creates new `CARD-JS-xxxxxx` IDs. Already-revoked cards are
                    skipped.
                  </span>
                </span>
              </label>

              <div className="text-[11px] text-text-secondary mt-3 leading-relaxed">
                {bulkPreviewCount !== null ? (
                  <>
                    Matched: <strong className="text-navy">{bulkPreviewCount}</strong>{' '}
                    members. 6 cards per A4 page.{' '}
                    {bulkPreviewCount > 1500 && (
                      <span className="text-status-red font-semibold block mt-1">
                        Limit is 1500 per job — narrow to a ward or booth.
                      </span>
                    )}
                  </>
                ) : (
                  <>Pick a block to preview the count.</>
                )}
              </div>

              <button
                onClick={onGenerateSheet}
                disabled={!canRunBulk || (bulkPreviewCount ?? 0) > 1500}
                className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                <IconDownload size={14} />
                {bulkRunning ? 'Generating…' : 'Generate & download'}
              </button>

              {bulkProgress && (
                <div className="mt-4">
                  <div className="text-[11px] text-text-secondary mb-1.5">
                    {bulkProgress.message}
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-subtle overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width:
                          bulkProgress.total === 0
                            ? '10%'
                            : `${Math.round(
                                (bulkProgress.current / bulkProgress.total) *
                                  100,
                              )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="text-[11px] text-text-muted leading-relaxed px-1">
              Tip: cards are ordered by ward → booth → name, so printed sheets
              can be cut and handed out in locality batches.
            </div>
          </div>
        </div>
      </div>

      {/* Hidden off-screen stage for bulk html2canvas rendering. */}
      <div
        ref={bulkStageRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-20000px',
          top: 0,
          width: '342px',
        }}
      >
        {bulkCardsToRender.map((c) => (
          <div key={c.id} data-bulk-card>
            <IdCard card={c} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wide mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-2.5 py-2 text-sm border border-border rounded bg-white focus:outline-none focus:border-primary disabled:bg-surface-subtle disabled:text-text-muted"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
