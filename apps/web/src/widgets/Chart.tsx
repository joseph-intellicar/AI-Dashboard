import { useEffect, useRef } from 'react';
import { echarts } from './echarts';

type ECharts = ReturnType<typeof echarts.init>;
export type ChartOption = Parameters<ECharts['setOption']>[0];
export interface ChartClick {
  seriesId?: string;
  name: string;
  dataIndex: number;
  /** Viewport coordinates of the click (for anchoring a popover). */
  x: number;
  y: number;
}

/** Minimal ECharts wrapper: SVG renderer, resizes with its container, optional click handler. */
export function Chart({
  option,
  onClick,
  ariaLabel,
  className,
}: {
  option: ChartOption;
  onClick?: (e: ChartClick) => void;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const el = ref.current!;
    const instance = echarts.init(el, undefined, { renderer: 'svg' });
    chart.current = instance;
    instance.on('click', (p) => {
      const native = (p.event as { event?: MouseEvent } | undefined)?.event;
      clickRef.current?.({
        seriesId: p.seriesId ?? undefined,
        name: String(p.name),
        dataIndex: p.dataIndex,
        x: native?.clientX ?? 0,
        y: native?.clientY ?? 0,
      });
    });
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    if (ref.current) ref.current.style.cursor = onClick ? 'pointer' : '';
  }, [onClick]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className ?? 'h-full w-full'} />;
}
