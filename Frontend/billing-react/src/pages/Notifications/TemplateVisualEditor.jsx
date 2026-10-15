import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button, Input } from 'antd';
import { createFieldChip, fieldLabel, loadVisualEditor, parseTemplateToVisualModel, serializeVisualEditor } from './templateVisualModel';

export const TemplateVisualEditor = forwardRef(function TemplateVisualEditor({ value = '', onChange, variables = [], rich = false, disabled, id, onActivate, ...accessibility }, ref) {
  const root = useRef(null);
  const sourceInput = useRef(null);
  const sourceSelection = useRef(null);
  const selection = useRef(null);
  const last = useRef(null);
  const [source, setSource] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    if (last.current !== value || root.current.dataset.metadata !== JSON.stringify(variables)) {
      loadVisualEditor(root.current, value, variables, rich);
      root.current.dataset.metadata = JSON.stringify(variables);
      last.current = value;
      selection.current = null;
    }
  }, [value, variables, rich, source]);
  const remember = () => {
    onActivate?.();
    const current = window.getSelection();
    if (current?.rangeCount && root.current?.contains(current.anchorNode) && root.current?.contains(current.focusNode)) selection.current = current.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    const editor = root.current; editor.focus();
    const range = selection.current && editor.contains(selection.current.startContainer) ? selection.current : document.createRange();
    if (range !== selection.current) { range.selectNodeContents(editor); range.collapse(false); }
    const current = window.getSelection(); current.removeAllRanges(); current.addRange(range);
    return range;
  };
  const emit = () => { const next = serializeVisualEditor(root.current, rich); last.current = next; onChange?.(next); remember(); };
  const insertNode = node => {
    const range = restore(); range.deleteContents(); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range); selection.current = range.cloneRange(); emit();
  };
  useImperativeHandle(ref, () => ({ insert(variable) {
    if (disabled) return;
    if (source) {
      const [start, end] = sourceSelection.current || [value.length, value.length];
      onChange?.(value.slice(0, start) + variable.token + value.slice(end));
      const position = start + variable.token.length;
      sourceSelection.current = [position, position];
      requestAnimationFrame(() => { const input = sourceInput.current?.resizableTextArea?.textArea; input?.focus(); input?.setSelectionRange(position, position); });
      return;
    }
    insertNode(createFieldChip({ token: variable.token, label: fieldLabel(variable), known: true }));
  } }));
  const format = command => { restore(); document.execCommand(command, false, command === 'formatBlock' ? 'p' : undefined); emit(); };
  return <div className={`notification-visual-editor ${rich ? 'is-rich' : ''} ${disabled ? 'is-disabled' : ''}`}>
    {rich && <div className="notification-editor-toolbar"><div>{!source && <>
      <Button size="small" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => format('formatBlock')}>Paragraph</Button>
      <Button size="small" aria-label="Bold" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => format('bold')}><strong>B</strong></Button>
      <span className="notification-toolbar-hint">Enter for a paragraph · Shift+Enter for a line break</span>
    </>}</div><Button size="small" type="text" disabled={disabled} onClick={() => { setSource(!source); last.current = null; }}>{source ? 'Visual Editor' : 'HTML Source'}</Button></div>}
    {source ? <Input.TextArea ref={sourceInput} id={id} aria-label="Body HTML Source" value={value} disabled={disabled} rows={12} onFocus={onActivate} onSelect={event => { sourceSelection.current = [event.target.selectionStart, event.target.selectionEnd]; }} onChange={event => onChange?.(event.target.value)} className="notification-html-editor" /> : <div {...accessibility} id={id} ref={root} role="textbox" aria-label={rich ? 'Body Template' : 'Subject Template'} aria-multiline={rich} aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning className="notification-editable" onInput={emit} onFocus={remember} onBlur={remember} onKeyUp={remember} onMouseUp={remember}
      onKeyDown={event => { if (!rich && event.key === 'Enter') event.preventDefault(); }}
      onPaste={event => {
        event.preventDefault();
        const fragment = document.createDocumentFragment();
        const text = event.clipboardData.getData('text/plain');
        for (const part of parseTemplateToVisualModel(rich ? text : text.replace(/[\r\n]+/g, ' '), variables)) {
          if (part.type === 'token') fragment.append(createFieldChip(part));
          else part.text.split(/\r?\n/).forEach((line, index) => { if (index) fragment.append(document.createElement('br')); fragment.append(document.createTextNode(line)); });
        }
        // A fragment is consumed by insertion; keep its final child for the caret.
        const end = document.createTextNode(''); fragment.append(end);
        const range = restore(); range.deleteContents(); range.insertNode(fragment); range.setStartAfter(end); range.collapse(true);
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range); selection.current = range.cloneRange(); emit();
      }} onDrop={event => event.preventDefault()} />}
  </div>;
});
