import { ArrowBack } from '@mui/icons-material';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Select, Spin, Switch, Tooltip } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDraftState, useFormDraft } from '../../context/FormDraftContext';
import { eventOptions, notificationError, notificationService, previewPayload } from './notificationService';
import { TemplateVisualEditor } from './TemplateVisualEditor';
import { fieldLabel } from './templateVisualModel';
import { NotificationError, NotificationPreview, NotificationShell, useNotificationFeedback } from './NotificationShared';

const blank = { eventType: undefined, name: '', description: '', subjectTemplate: '', bodyTemplate: '', isActive: true };
const required = label => [{ required: true, whitespace: true, message: `${label} is required.` }];

export function NotificationTemplateForm() {
  const { id } = useParams();
  return <TemplateEditor key={id || 'new'} id={id} />;
}
function TemplateEditor({ id }) {
  const editing = Boolean(id);
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = `notification-template:${id || 'new'}`;
  const draft = useFormDraft(key);
  const [values, setValues] = useDraftState(key, 'values', editing ? null : blank);
  const [form] = Form.useForm();
  const [toast, toastHolder] = useNotificationFeedback();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [preview, setPreview] = useState(null);
  const locked = useRef(false);
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const activeEditor = useRef('bodyTemplate');
  const query = useQuery({ queryKey: ['notification-template', id], queryFn: ({ signal }) => notificationService.getTemplateById(id, { signal }), enabled: editing, retry: false });
  useEffect(() => {
    if (editing && query.data && !values) setValues(query.data);
  }, [editing, query.data, values, setValues]);
  const variables = useQuery({ queryKey: ['notification-variables', values?.eventType], queryFn: ({ signal }) => notificationService.getVariables(values.eventType, { signal }), enabled: Boolean(values?.eventType), retry: false });
  const insert = variable => {
    (activeEditor.current === 'subjectTemplate' ? subjectRef : bodyRef).current?.insert(variable);
  };
  const save = async submitted => {
    if (locked.current) return;
    locked.current = true; setSaving(true); setSaveError(null);
    try {
      // The event type on edit always comes from the loaded resource/draft; update DTO omits it.
      if (editing) await notificationService.updateTemplate(id, submitted);
      else await notificationService.createTemplate(submitted);
      draft.clear();
      await Promise.all([client.invalidateQueries({ queryKey: ['notification-templates'] }), client.invalidateQueries({ queryKey: ['notification-template', id] })]);
      navigate('/settings/notifications', { state: { notificationSaved: true } });
    } catch (error) { setSaveError(error); toast.error(notificationError(error)); }
    finally { locked.current = false; setSaving(false); }
  };
  const showPreview = async () => {
    try { await form.validateFields(['eventType', 'subjectTemplate', 'bodyTemplate']); setPreview(previewPayload(form.getFieldsValue(true))); }
    catch { /* Form displays field validation errors. */ }
  };
  const cancel = () => { if (!locked.current) { draft.clear(); navigate('/settings/notifications'); } };
  const content = !values ? query.error ? <NotificationError error={query.error} onRetry={() => query.refetch()} /> : <div className="notification-loading" role="status"><Spin />Loading template...</div> : <Form form={form} layout="vertical" initialValues={values} onValuesChange={(_, all) => setValues(previous => ({ ...previous, ...all }))} onFinish={save} disabled={saving} requiredMark={false}>
    <div className="notification-form-grid">
      <Form.Item name="eventType" label="Event Type" rules={[{ required: true, message: 'Select an event type.' }]} extra={editing ? 'Event type is fixed after creation.' : undefined}><Select aria-label="Event Type" options={eventOptions} disabled={editing || saving} placeholder="Select event type" /></Form.Item>
      <Form.Item label="Channel"><div className="notification-channel" aria-label="Channel: Email"><span>Email</span></div></Form.Item>
      <Form.Item name="name" label="Template Name" rules={[...required('Template name'), { max: 128 }]}><Input maxLength={128} /></Form.Item>
      <Form.Item name="description" label="Description" rules={[{ max: 256 }]}><Input maxLength={256} /></Form.Item>
    </div>
    <Form.Item name="subjectTemplate" label="Subject Template" rules={[...required('Subject template'), { max: 500 }]}><TemplateVisualEditor ref={subjectRef} variables={variables.data} disabled={saving} onActivate={() => { activeEditor.current = 'subjectTemplate'; }} /></Form.Item>
    <Form.Item name="bodyTemplate" label="Body Template" rules={required('Body template')}><TemplateVisualEditor ref={bodyRef} rich variables={variables.data} disabled={saving} onActivate={() => { activeEditor.current = 'bodyTemplate'; }} /></Form.Item>
    <section className="notification-variables" aria-label="Available Fields"><h2>Available Fields</h2><p>Click a field to insert it into the subject or message.</p>
      {!values.eventType ? <span>Select an event type to see available fields.</span> : variables.isPending ? <span role="status">Loading fields...</span> : variables.error ? <NotificationError error={variables.error} onRetry={() => variables.refetch()} /> : <div className="notification-variable-chips">{variables.data.length ? variables.data.map(variable => <Tooltip title={<><div>{variable.description}</div>{variable.exampleValue != null && <div>Example: {String(variable.exampleValue)}</div>}</>} key={variable.token}><Button size="small" disabled={saving} onMouseDown={event => event.preventDefault()} onClick={() => insert(variable)}>+ {fieldLabel(variable)}</Button></Tooltip>) : <span>No fields provided for this event.</span>}</div>}
    </section>
    {saveError && <Alert type="error" showIcon title={notificationError(saveError)} />}
    <footer className="notification-form-actions"><Form.Item name="isActive" label="Active Template" valuePropName="checked"><Switch aria-label="Active Template" /></Form.Item><Button onClick={cancel} disabled={saving}>Cancel</Button><Button onClick={showPreview} disabled={saving}>Preview</Button><Button type="primary" htmlType="submit" loading={saving}>Save Template</Button></footer>
  </Form>;
  return <NotificationShell title={editing ? 'Edit Notification Template' : 'Create Notification Template'} description="Personalize automated customer emails with your message and available fields." actions={<Button className="workspace-back-button" icon={<ArrowBack fontSize="small" />} disabled={saving} onClick={() => navigate('/settings/notifications')}>Back to Notifications</Button>}>
    {toastHolder}<section className="notification-card notification-editor">{content}</section>
    {preview && <NotificationPreview payload={preview} onClose={() => setPreview(null)} />}
  </NotificationShell>;
}
