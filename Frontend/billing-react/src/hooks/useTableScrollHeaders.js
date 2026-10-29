import { useLayoutEffect, useRef } from 'react';

const scrollFrames = [
  '.ibms-table-frame', '.MuiTableContainer-root', '.invoice-table-scroll',
  '.integrations-table-scroll', '.background-jobs-table-scroll', '.ura-table-wrap',
  '.ant-table-content', '.ant-table-body',
];
const headers = scrollFrames.map(frame => frame + ' > table > thead').join(',');

// Reserve only the actual header height above each native scrollbar track.
// Keeping the original table intact preserves column sizing and accessibility.
export function useTableScrollHeaders() {
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tracked = new Map();
    const measure = (header, frame) => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      frame.style.setProperty('--table-scroll-header-height', height + 'px');
      frame.dataset.tableScrollHeader = '';
    };
    const resize = new ResizeObserver(entries => {
      entries.forEach(({ target }) => {
        const frame = tracked.get(target);
        if (frame) measure(target, frame);
      });
    });
    const release = (header, frame) => {
      resize.unobserve(header);
      frame.style.removeProperty('--table-scroll-header-height');
      delete frame.dataset.tableScrollHeader;
      tracked.delete(header);
    };
    const sync = () => {
      tracked.forEach((frame, header) => {
        if (!root.contains(header) || header.parentElement?.parentElement !== frame) release(header, frame);
      });
      root.querySelectorAll(headers).forEach(header => {
        if (tracked.has(header) || header.closest('.invoice-document')) return;
        const frame = header.parentElement.parentElement;
        tracked.set(header, frame);
        measure(header, frame);
        resize.observe(header);
      });
    };
    sync();
    const changes = new MutationObserver(sync);
    changes.observe(root, { childList: true, subtree: true });
    return () => {
      changes.disconnect();
      tracked.forEach((frame, header) => release(header, frame));
      resize.disconnect();
    };
  }, []);
  return rootRef;
}
