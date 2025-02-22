/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AggregationOptionsByType } from '@kbn/es-types';
import { kqlQuery, rangeQuery } from '@kbn/observability-plugin/server';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import {
  METRIC_CGROUP_MEMORY_USAGE_BYTES,
  METRIC_PROCESS_CPU_PERCENT,
  METRIC_SYSTEM_FREE_MEMORY,
  METRIC_SYSTEM_TOTAL_MEMORY,
  SERVICE_NAME,
  SERVICE_NODE_NAME,
} from '../../../../common/es_fields/apm';
import { SERVICE_NODE_NAME_MISSING } from '../../../../common/service_nodes';
import { Coordinate } from '../../../../typings/timeseries';
import { environmentQuery } from '../../../../common/utils/environment_query';
import { getBucketSize } from '../../../lib/helpers/get_bucket_size';
import { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import {
  percentCgroupMemoryUsedScript,
  percentSystemMemoryUsedScript,
} from '../../metrics/by_agent/shared/memory';
import { getOffsetInMs } from '../../../../common/utils/get_offset_in_ms';

interface ServiceInstanceSystemMetricPrimaryStatistics {
  serviceNodeName: string;
  cpuUsage: number | null;
  memoryUsage: number | null;
}

interface ServiceInstanceSystemMetricComparisonStatistics {
  serviceNodeName: string;
  cpuUsage: Coordinate[];
  memoryUsage: Coordinate[];
}

type ServiceInstanceSystemMetricStatistics<T> = T extends true
  ? ServiceInstanceSystemMetricComparisonStatistics
  : ServiceInstanceSystemMetricPrimaryStatistics;

export async function getServiceInstancesSystemMetricStatistics<
  T extends true | false
>({
  environment,
  kuery,
  apmEventClient,
  serviceName,
  size,
  start,
  end,
  serviceNodeIds,
  numBuckets,
  isComparisonSearch,
  offset,
}: {
  apmEventClient: APMEventClient;
  serviceName: string;
  start: number;
  end: number;
  numBuckets?: number;
  serviceNodeIds?: string[];
  environment: string;
  kuery: string;
  size?: number;
  isComparisonSearch: T;
  offset?: string;
}): Promise<Array<ServiceInstanceSystemMetricStatistics<T>>> {
  const { startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const { intervalString } = getBucketSize({
    start: startWithOffset,
    end: endWithOffset,
    numBuckets,
  });

  const systemMemoryFilter = {
    bool: {
      filter: [
        { exists: { field: METRIC_SYSTEM_FREE_MEMORY } },
        { exists: { field: METRIC_SYSTEM_TOTAL_MEMORY } },
      ],
    },
  };

  const cgroupMemoryFilter = {
    exists: { field: METRIC_CGROUP_MEMORY_USAGE_BYTES },
  };

  const cpuUsageFilter = { exists: { field: METRIC_PROCESS_CPU_PERCENT } };

  function withTimeseries<TParams extends AggregationOptionsByType['avg']>(
    agg: TParams
  ) {
    return {
      ...(isComparisonSearch
        ? {
            avg: { avg: agg },
            timeseries: {
              date_histogram: {
                field: '@timestamp',
                fixed_interval: intervalString,
                min_doc_count: 0,
                extended_bounds: {
                  min: startWithOffset,
                  max: endWithOffset,
                },
              },
              aggs: { avg: { avg: agg } },
            },
          }
        : { avg: { avg: agg } }),
    };
  }

  const subAggs = {
    memory_usage_cgroup: {
      filter: cgroupMemoryFilter,
      aggs: withTimeseries({ script: percentCgroupMemoryUsedScript }),
    },
    memory_usage_system: {
      filter: systemMemoryFilter,
      aggs: withTimeseries({ script: percentSystemMemoryUsedScript }),
    },
    cpu_usage: {
      filter: cpuUsageFilter,
      aggs: withTimeseries({ field: METRIC_PROCESS_CPU_PERCENT }),
    },
  };

  const response = await apmEventClient.search(
    'get_service_instances_system_metric_statistics',
    {
      apm: {
        events: [ProcessorEvent.metric],
      },
      body: {
        track_total_hits: false,
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { [SERVICE_NAME]: serviceName } },
              ...rangeQuery(startWithOffset, endWithOffset),
              ...environmentQuery(environment),
              ...kqlQuery(kuery),
              ...(isComparisonSearch && serviceNodeIds
                ? [{ terms: { [SERVICE_NODE_NAME]: serviceNodeIds } }]
                : []),
            ],
            should: [cgroupMemoryFilter, systemMemoryFilter, cpuUsageFilter],
            minimum_should_match: 1,
          },
        },
        aggs: {
          [SERVICE_NODE_NAME]: {
            terms: {
              field: SERVICE_NODE_NAME,
              missing: SERVICE_NODE_NAME_MISSING,
              ...(size ? { size } : {}),
              ...(isComparisonSearch ? { include: serviceNodeIds } : {}),
            },
            aggs: subAggs,
          },
        },
      },
    }
  );

  return (
    (response.aggregations?.[SERVICE_NODE_NAME].buckets.map(
      (serviceNodeBucket) => {
        const serviceNodeName = String(serviceNodeBucket.key);
        const hasCGroupData =
          serviceNodeBucket.memory_usage_cgroup.avg.value !== null;

        const memoryMetricsKey = hasCGroupData
          ? 'memory_usage_cgroup'
          : 'memory_usage_system';

        const cpuUsage =
          // Timeseries is available when isComparisonSearch is true
          'timeseries' in serviceNodeBucket.cpu_usage
            ? serviceNodeBucket.cpu_usage.timeseries.buckets.map(
                (dateBucket) => ({
                  x: dateBucket.key,
                  y: dateBucket.avg.value,
                })
              )
            : serviceNodeBucket.cpu_usage.avg.value;

        const memoryUsageValue = serviceNodeBucket[memoryMetricsKey];
        const memoryUsage =
          // Timeseries is available when isComparisonSearch is true
          'timeseries' in memoryUsageValue
            ? memoryUsageValue.timeseries.buckets.map((dateBucket) => ({
                x: dateBucket.key,
                y: dateBucket.avg.value,
              }))
            : serviceNodeBucket[memoryMetricsKey].avg.value;

        return {
          serviceNodeName,
          cpuUsage,
          memoryUsage,
        };
      }
    ) as Array<ServiceInstanceSystemMetricStatistics<T>>) || []
  );
}
