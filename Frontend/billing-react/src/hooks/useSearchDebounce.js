import { useEffect, useRef, useState } from 'react';
import { scheduleSearch } from '../utils/search';

export function useSearchCommit(value, commit) {
  const latest = useRef(commit);
  useEffect(() => { latest.current = commit; });
  useEffect(() => scheduleSearch(value, next => latest.current(next)), [value]);
}

export function useSearchDebounce(value) {
  const [search, setSearch] = useState(value.trim());
  useSearchCommit(value, setSearch);
  return search;
}
