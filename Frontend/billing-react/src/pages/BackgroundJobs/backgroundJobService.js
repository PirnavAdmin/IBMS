import { apiClient } from 'billing-api-client';

const jobsBase = '/api/v1/background-jobs';
const exportsBase = '/api/v1/export-jobs';

function unwrap(response, label) {
  if (response?.success !== true || response.data == null) {
    throw new Error(response?.message || `The ${label} service returned an invalid response.`);
  }
  return response.data;
}

export function backgroundJobError(error) {
  const status = error?.response?.status ?? error?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to view or manage background jobs.';
  if (status >= 500) return 'The background job service could not complete the request. Please try again.';
  return error?.userMessage || error?.message || 'Unable to reach the background job service.';
}

export function mapBackgroundJob(job) {
  if (!job || typeof job.jobName !== 'string' || typeof job.status !== 'string') {
    throw new Error('The background job service returned an invalid job status.');
  }
  return {
    jobName: job.jobName,
    description: job.description || '',
    status: job.status,
    lastRunAtUtc: job.lastRunAtUtc || null,
    nextScheduledRunUtc: job.nextScheduledRunUtc || null,
    lastRunSuccess: Boolean(job.lastRunSuccess),
    lastRunMessage: job.lastRunMessage || '',
    lastProcessedCount: Number(job.lastProcessedCount) || 0,
    lastExecutionDurationMs: Number(job.lastExecutionDurationMs) || 0,
  };
}

export function mapExportJob(job) {
  if (!job || !Number.isInteger(job.id) || typeof job.jobType !== 'string' ||
      typeof job.exportFormat !== 'string' || typeof job.status !== 'string') {
    throw new Error('The export service returned an invalid export job.');
  }
  return {
    id: job.id,
    jobType: job.jobType,
    exportFormat: job.exportFormat,
    status: job.status,
    fileName: job.fileName || '',
    fileSizeBytes: job.fileSizeBytes ?? null,
    totalRecords: Number(job.totalRecords) || 0,
    processedRecords: Number(job.processedRecords) || 0,
    errorMessage: job.errorMessage || '',
    requestedBy: job.requestedBy || '',
    createdAtUtc: job.createdAtUtc || null,
    startedAtUtc: job.startedAtUtc || null,
    completedAtUtc: job.completedAtUtc || null,
  };
}

export const backgroundJobService = {
  async getStatuses(signal) {
    const data = unwrap(await apiClient.get(`${jobsBase}/status`, { signal }), 'background job');
    if (!Array.isArray(data)) throw new Error('The background job service returned an invalid status list.');
    return data.map(mapBackgroundJob);
  },
  async getExports({ page = 1, pageSize = 20, jobType = '', status = '' }, signal) {
    const data = unwrap(await apiClient.get(exportsBase, {
      signal,
      params: { page, pageSize, ...(jobType ? { jobType } : {}), ...(status ? { status } : {}) },
    }), 'export');
    if (!Array.isArray(data?.items) || !Number.isInteger(data.totalCount) ||
        !Number.isInteger(data.pageNumber) || !Number.isInteger(data.pageSize)) {
      throw new Error('The export service returned an invalid export job list.');
    }
    return {
      items: data.items.map(mapExportJob),
      totalCount: data.totalCount,
      page: data.pageNumber,
      pageSize: data.pageSize,
    };
  },
  async createExport({ jobType, exportFormat }) {
    return mapExportJob(unwrap(await apiClient.post(exportsBase, { jobType, exportFormat }), 'export'));
  },
  async downloadExport(id) {
    const response = await apiClient.get(`${exportsBase}/${id}/download`, { responseType: 'blob' });
    return response?.data ?? response;
  },
};
