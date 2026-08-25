'use client';

import { useRouter } from 'next/navigation';
import { Card, EmptyState, Loading } from '@/components/ui';

/**
 * One table, used by every list in the app.
 *
 * The shop keeps its records tabulated and always has — the invoice pad, the
 * price card, the job book are all grids. Lists of stacked cards read well on
 * a phone and badly on the counter machine, where the job is to run an eye
 * down one column: who owes money, what is due today, what is running out.
 *
 * Columns declare how they behave rather than each page restating it:
 *
 *   align    'right' for anything countable, so digits line up
 *   tnum     tabular figures, so 1,100 and 999 are the same width
 *   hideOn   'sm' drops a column on a narrow screen instead of squeezing
 *   render   a cell that needs more than text — a chip, two lines, a link
 *
 * A row can carry an `href`; the whole row then behaves as a link, because a
 * counter hand aiming at a small link on a busy screen is a counter hand
 * missing it.
 */
export default function DataTable({
  columns,
  rows,
  loading,
  empty,
  hrefFor,
  minWidth = 720,
  footer,
}) {
  const router = useRouter();

  if (loading) {
    return (
      <Card>
        <Loading />
      </Card>
    );
  }

  if (!rows?.length) {
    return <Card>{empty || <EmptyState title="Nothing here" />}</Card>;
  }

  return (
    <Card>
      {/* Scrolls sideways rather than reflowing into cards. A table that
          rearranges itself on a narrow screen stops being a table, which is
          the thing that made it readable. */}
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: `${minWidth}px` }}
        >
          <thead>
            <tr className="border-b border-line bg-surface">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={
                    'px-3 py-2 text-xs font-semibold text-muted ' +
                    (c.align === 'right' ? 'text-right ' : 'text-left ') +
                    hideClass(c.hideOn) +
                    (c.width || '')
                  }
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, i) => {
              const href = hrefFor?.(row);
              return (
                <tr
                  key={row._id || row.key || i}
                  onClick={href ? () => router.push(href) : undefined}
                  className={
                    'border-b border-line ' +
                    (href ? 'cursor-pointer hover:bg-page ' : '') +
                    (row._tone === 'bad' ? 'bg-bad-soft/40 ' : '')
                  }
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        'px-3 py-2 align-middle ' +
                        (c.align === 'right' ? 'text-right ' : '') +
                        (c.tnum ? 'tnum ' : '') +
                        hideClass(c.hideOn)
                      }
                    >
                      {c.render ? c.render(row) : value(row, c.key)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {footer ? <tfoot>{footer}</tfoot> : null}
        </table>
      </div>
    </Card>
  );
}

/* Dropped rather than squeezed. Six columns crushed onto a phone are six
 * columns nobody can read; the ones that matter most stay. */
function hideClass(hideOn) {
  if (hideOn === 'sm') return 'hidden sm:table-cell ';
  if (hideOn === 'md') return 'hidden md:table-cell ';
  return '';
}

/** Supports "sale.balance" so a page need not write a render for every field. */
function value(row, path) {
  return path.split('.').reduce((v, k) => (v == null ? v : v[k]), row) ?? '';
}
