import {
  effectiveDateFilter,
  queryPart,
  type DateFilter,
  type QueryResult,
  type WidgetConfig,
} from '@insightflow/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/** One POST /api/query per widget. Title and appearance are not part of the key, so recolouring never re-queries. */
export function widgetQueryKey(
  config: Pick<WidgetConfig, 'type' | 'fields' | 'options'>,
  dashboardFilter: DateFilter,
) {
  return [
    'widget-data',
    queryPart(config),
    effectiveDateFilter(config.options.dateRange, dashboardFilter),
  ] as const;
}

export function useWidgetData(config: WidgetConfig, dashboardFilter: DateFilter, { enabled = true } = {}) {
  return useQuery({
    queryKey: widgetQueryKey(config, dashboardFilter),
    queryFn: () =>
      api.post<QueryResult>('/api/query', {
        config: queryPart(config),
        dashboardDateFilter: dashboardFilter,
      }),
    staleTime: 60_000,
    // Keep showing the previous result while refetching (e.g. after a date-filter change), but only
    // when the widget's shape is unchanged — a result for other fields would not fit this chart.
    placeholderData: (prev, prevQuery) => {
      const before = prevQuery?.queryKey[1] as ReturnType<typeof queryPart> | undefined;
      return before && sameShape(before, config) ? prev : undefined;
    },
    enabled,
  });
}

function sameShape(a: Pick<WidgetConfig, 'type' | 'fields'>, b: Pick<WidgetConfig, 'type' | 'fields'>) {
  return a.type === b.type && JSON.stringify(a.fields) === JSON.stringify(b.fields);
}
