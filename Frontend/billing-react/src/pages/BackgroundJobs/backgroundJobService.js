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
  const data = error?.response?.data;
  const serverMessage = typeof data === 'object' && data !== null && !(typeof Blob !== 'undefined' && data instanceof Blob)
    ? (data.message || data.detail || data.title)
    : null;
  if (serverMessage) return serverMessage;
  if (status === 403) return 'You do not have permission to view or manage background jobs or exports.';
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
  async getStatuses(signal, options = {}) {
    const config = options?.backgroundPoll ? { signal, backgroundPoll: true } : { signal };
    const data = unwrap(await apiClient.get(`${jobsBase}/status`, config), 'background job');
    if (!Array.isArray(data)) throw new Error('The background job service returned an invalid status list.');
    return data.map(mapBackgroundJob);
  },
  async getExports({ page = 1, pageSize = 20, jobType = '', status = '' }, signal, options = {}) {
    const config = {
      signal,
      ...(options?.backgroundPoll ? { backgroundPoll: true } : {}),
      params: { page, pageSize, ...(jobType ? { jobType } : {}), ...(status ? { status } : {}) },
    };
    const data = unwrap(await apiClient.get(exportsBase, config), 'export');
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
    try {
      const response = await apiClient.get(`${exportsBase}/${id}/download`, { responseType: 'blob' });
      const payload = response?.data ?? response;
      if (payload && typeof payload === 'object' && !(typeof Blob !== 'undefined' && payload instanceof Blob) && payload.success === false) {
        throw new Error(payload.message || 'Export file could not be downloaded.');
      }
      if (typeof Blob !== 'undefined' && payload instanceof Blob && /^text\/html(?:;|$)/i.test(payload.type || '')) {
        throw new Error('The export service did not return a valid export file.');
      }
      return payload;
    } catch (error) {
      const blobData = error?.response?.data;
      if (blobData && typeof blobData.text === 'function') {
        try {
          const text = await blobData.text();
          const parsed = JSON.parse(text);
          const msg = parsed?.message || parsed?.detail || parsed?.title ||
            (Array.isArray(parsed?.errors) ? parsed.errors.filter(Boolean).join(' ') : null);
          if (msg) {
            error.message = msg;
            error.userMessage = msg;
          }
        } catch {}
      }
      throw error;
    }
  },
};
