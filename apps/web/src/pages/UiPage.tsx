/** Dev-only gallery of UI primitives (/ui). Not included in production builds. */
import type { DateFilter } from '@insightflow/shared';
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Logo } from '../components/layout/Logo';
import { Button, IconButton } from '../components/ui/Button';
import { Card, Skeleton } from '../components/ui/Card';
import {
  Field,
  Input,
  MultiSelect,
  SearchInput,
  SegmentedControl,
  Select,
  Toggle,
} from '../components/ui/Controls';
import { DateFilterPicker } from '../components/ui/DateFilterPicker';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../components/ui/Menu';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { Tooltip } from '../components/ui/Tooltip';

export default function UiPage() {
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<'compact' | 'full'>('compact');
  const [values, setValues] = useState<string[]>(['South']);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DateFilter>({ preset: 'last_30_days' });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Logo />
      <Section title="Buttons">
        <Button variant="primary" icon={<Plus className="size-4" />}>
          Add widget
        </Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Remove</Button>
        <Button variant="primary" loading>
          Saving
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <IconButton label="More">
          <MoreHorizontal className="size-4" />
        </IconButton>
      </Section>
      <Section title="Menu · Tooltip · Toast · Dialogs">
        <Menu>
          <MenuTrigger asChild>
            <Button>Widget menu</Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Pencil />} onSelect={() => toast('Edit')}>
              Edit
            </MenuItem>
            <MenuItem icon={<Copy />} onSelect={() => toast('Duplicate')}>
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => setConfirm(true)}>
              Remove
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip content="Net sales after discounts, excluding shipping.">
          <Button>Hover me</Button>
        </Tooltip>
        <Button onClick={() => toast.success('Saved')}>Toast</Button>
        <Button onClick={() => toast.error("Couldn't save changes")}>Error toast</Button>
        <Button onClick={() => setModal(true)}>Open modal</Button>
      </Section>
      <Section title="Controls">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input defaultValue="Revenue by Category" />
          </Field>
          <Field label="Search">
            <SearchInput value={q} onChange={setQ} placeholder="Search fields" label="Search fields" />
          </Field>
          <Field label="Sort">
            <Select defaultValue="desc">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </Select>
          </Field>
          <Field label="Region">
            <MultiSelect
              label="Region"
              values={values}
              onChange={setValues}
              options={['North', 'South', 'West', 'East']}
            />
          </Field>
          <Field label="Number format">
            <SegmentedControl
              label="Number format"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'compact', label: '₹4.5L' },
                { value: 'full', label: '₹4,52,300' },
              ]}
            />
          </Field>
          <Field label="Date range">
            <DateFilterPicker value={filter} onChange={setFilter} />
          </Field>
          <Toggle id="cmp" checked={on} onCheckedChange={setOn} label="Compare to previous period" />
        </div>
      </Section>
      <Section title="Card · Skeleton">
        <Card className="w-64 p-4">
          <div className="text-sm text-muted">Total Revenue</div>
          <div className="mt-1 text-2xl font-semibold tabular">₹14.1L</div>
        </Card>
        <Card className="w-64 space-y-2 p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </Card>
      </Section>
      <Modal
        open={modal}
        onOpenChange={setModal}
        title="Create widget"
        description="Pick fields and a visualization."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setModal(false)}>Cancel</Button>
            <Button variant="primary">Add to dashboard</Button>
          </div>
        }
      >
        <div className="p-5 text-sm text-muted">Modal body</div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove 'Revenue by City'?"
        description="This widget will be removed from your dashboard."
        confirmLabel="Remove"
        onConfirm={() => toast('Removed')}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}
