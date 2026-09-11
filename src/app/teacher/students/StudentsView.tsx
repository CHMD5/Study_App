'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  KeyRound,
  Plus,
  RotateCw,
  Search,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Label,
  Pagination,
  Select,
  Spinner,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from '@/components/ui';

type Student = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  batch: string | null;
  isActive: boolean;
  canLogin: boolean;
  createdAt: string;
  testsTaken: number;
  avgScore: number;
  avgPercentile: number | null;
  lastAttemptAt: string | null;
};

type BatchOption = {
  name: string;
  count: number;
};

export function StudentsView() {
  const { toast } = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeToggleTarget, setActiveToggleTarget] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    batch: '',
    password: '',
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState<any[]>([]);

  const [targetBatchName, setTargetBatchName] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    batch: '',
    newPassword: '',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function loadBatches() {
    try {
      const res = await fetch('/api/batches');
      if (res.ok) {
        const json = await res.json();
        setBatches(json.batches ?? []);
      }
    } catch {
      // Ignored
    }
  }

  async function loadStudents() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (search) params.set('search', search);
      if (selectedBatch) params.set('batch', selectedBatch);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);

      const res = await fetch(`/api/students?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load students');

      setStudents(json.students ?? []);
      setTotal(json.total ?? 0);
      setPageCount(json.pageCount ?? 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadStudents();
    }, 250);
    return () => clearTimeout(handle);
  }, [page, search, selectedBatch, selectedStatus]);

  // Selection handlers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === students.length && students.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  }

  // Create Student
  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault();
    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to create student');

      toast.success(`Created account for ${json.student.fullName}`);
      setCreateModalOpen(false);
      setCreateForm({ fullName: '', username: '', email: '', phone: '', batch: '', password: '' });
      loadStudents();
      loadBatches();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  // Bulk Import
  async function handleImportCsv(e: React.FormEvent) {
    e.preventDefault();
    setImportSubmitting(true);
    setImportErrors([]);
    try {
      const res = await fetch('/api/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.errors) setImportErrors(json.errors);
        throw new Error(json.message || 'CSV import failed');
      }

      toast.success(json.message);
      setImportModalOpen(false);
      setCsvText('');
      loadStudents();
      loadBatches();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImportSubmitting(false);
    }
  }

  // Bulk Batch Assignment
  async function handleBulkBatch(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) return;
    setBatchSubmitting(true);
    try {
      const res = await fetch('/api/students/bulk-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          batch: targetBatchName.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to assign batch');

      toast.success(json.message);
      setBatchModalOpen(false);
      setSelectedIds(new Set());
      setTargetBatchName('');
      loadStudents();
      loadBatches();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBatchSubmitting(false);
    }
  }

  // Edit / Reset Password
  function openEditModal(student: Student) {
    setSelectedStudent(student);
    setEditForm({
      fullName: student.fullName,
      email: student.email,
      phone: student.phone ?? '',
      batch: student.batch ?? '',
      newPassword: '',
    });
    setEditModalOpen(true);
  }

  async function handleEditStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;
    setEditSubmitting(true);
    try {
      const payload: any = {
        fullName: editForm.fullName,
        email: editForm.email,
        phone: editForm.phone.trim() || null,
        batch: editForm.batch.trim() || null,
      };
      if (editForm.newPassword) {
        payload.newPassword = editForm.newPassword;
      }

      const res = await fetch(`/api/students/${selectedStudent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update student');

      toast.success(`Updated ${json.student.fullName}`);
      setEditModalOpen(false);
      setSelectedStudent(null);
      loadStudents();
      loadBatches();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEditSubmitting(false);
    }
  }

  // Toggle Active/Inactive
  async function handleToggleActive() {
    if (!activeToggleTarget) return;
    try {
      const nextActive = !activeToggleTarget.isActive;
      const res = await fetch(`/api/students/${activeToggleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive, canLogin: nextActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update account status');

      toast.success(
        nextActive
          ? `Activated ${activeToggleTarget.fullName}`
          : `Deactivated ${activeToggleTarget.fullName}`,
      );
      setActiveToggleTarget(null);
      loadStudents();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Student & Batch Roster
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Provision student credentials, assign cohort batches, and monitor overall candidate engagement.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setImportModalOpen(true)}>
            <Upload className="mr-1.5 size-3.5" />
            Bulk Import (CSV)
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
            <UserPlus className="mr-1.5 size-3.5" />
            Create Student
          </Button>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Total Students"
          value={total}
          tone="brand"
          subtext="Enrolled candidates"
          icon={<Users className="size-4" />}
        />
        <StatTile
          label="Batches Formed"
          value={batches.length}
          tone="emerald"
          subtext="Distinct cohort groups"
          icon={<UserCheck className="size-4" />}
        />
        <StatTile
          label="Active Accounts"
          value={students.filter((s) => s.isActive).length}
          tone="amber"
          subtext="Permitted to sign in"
          icon={<UserCheck className="size-4" />}
        />
      </div>

      {/* Search & Filters Card */}
      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, username or email…"
              className="pl-9"
              aria-label="Search students"
            />
          </div>

          <Select
            value={selectedBatch}
            onChange={(e) => {
              setSelectedBatch(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by batch"
          >
            <option value="">All Batches ({batches.reduce((a, b) => a + b.count, 0)})</option>
            {batches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name} ({b.count})
              </option>
            ))}
          </Select>

          <Select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </Select>
        </div>
      </Card>

      {/* Bulk Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/80 px-4 py-2.5 dark:border-brand-900/60 dark:bg-brand-950/60">
          <span className="text-xs font-semibold text-brand-900 dark:text-brand-200">
            {selectedIds.size} student{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => setBatchModalOpen(true)}>
              Assign to Batch
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {error ? <Alert tone="red">{error}</Alert> : null}

      {/* Roster Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-8 text-brand-600 dark:text-brand-400" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          title="No students found"
          hint="No students match the selected filters. Create an individual account or import a CSV roster."
          action={
            <Button variant="primary" size="md" onClick={() => setCreateModalOpen(true)}>
              Create First Student
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === students.length && students.length > 0}
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    aria-label="Select all students on page"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead>Tests Taken</TableHead>
                <TableHead>Avg Score</TableHead>
                <TableHead>Avg Percentile</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const isSelected = selectedIds.has(s.id);
                return (
                  <TableRow key={s.id} className={isSelected ? 'bg-brand-50/40 dark:bg-brand-950/20' : undefined}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(s.id)}
                        className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        aria-label={`Select ${s.fullName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.fullName}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {s.phone ? (
                          <span className="font-mono font-medium text-brand-700 dark:text-brand-300">
                            {s.phone} ·{' '}
                          </span>
                        ) : null}
                        {s.username} · {s.email}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={s.batch && s.batch !== 'General' ? 'brand' : 'slate'}>
                        {s.batch ?? 'General'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.isActive ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="red">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tnum text-slate-600 dark:text-slate-400">{s.testsTaken}</TableCell>
                    <TableCell className="tnum font-bold text-slate-900 dark:text-slate-100">
                      {s.testsTaken > 0 ? `${s.avgScore} M` : '—'}
                    </TableCell>
                    <TableCell className="tnum font-semibold text-accent-600 dark:text-accent-400">
                      {s.avgPercentile !== null ? `${s.avgPercentile} %ile` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditModal(s)}
                          title="Edit details or reset password"
                        >
                          <KeyRound className="size-3.5" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActiveToggleTarget(s)}
                          className={
                            s.isActive
                              ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40'
                              : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                          }
                          title={s.isActive ? 'Deactivate account' : 'Activate account'}
                        >
                          {s.isActive ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <Pagination
              currentPage={page}
              totalPages={pageCount}
              pageSize={25}
              totalItems={total}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        </Card>
      )}

      {/* 1. Create Student Modal */}
      <Dialog
        isOpen={createModalOpen}
        onClose={() => !createSubmitting && setCreateModalOpen(false)}
        title="Create Student Account"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={createSubmitting}
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-student-form" disabled={createSubmitting}>
              {createSubmitting ? <Spinner className="mr-1.5 size-3.5" /> : null}
              Create Account
            </Button>
          </div>
        }
      >
        <form id="create-student-form" onSubmit={handleCreateStudent} className="space-y-3.5">
          <div>
            <Label>Full Name *</Label>
            <Input
              required
              value={createForm.fullName}
              onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
              placeholder="e.g. Ramesh Sharma"
            />
          </div>
          <div>
            <Label>Username *</Label>
            <Input
              required
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              placeholder="e.g. ramesh.sharma"
            />
          </div>
          <div>
            <Label>Email Address *</Label>
            <Input
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="e.g. ramesh@example.com"
            />
          </div>
          <div>
            <Label>Mobile Number (for student login)</Label>
            <Input
              type="tel"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
          <div>
            <Label>Batch / Cohort</Label>
            <Input
              value={createForm.batch}
              onChange={(e) => setCreateForm({ ...createForm, batch: e.target.value })}
              placeholder="e.g. JEE-2027-A (or select existing below)"
              list="batch-suggestions"
            />
            <datalist id="batch-suggestions">
              {batches.map((b) => (
                <option key={b.name} value={b.name} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Password (Default: 112345)</Label>
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              placeholder="112345"
            />
          </div>
        </form>
      </Dialog>

      {/* 2. Bulk Import CSV Modal */}
      <Dialog
        isOpen={importModalOpen}
        onClose={() => !importSubmitting && setImportModalOpen(false)}
        title="Bulk Import Students (CSV)"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={importSubmitting}
              onClick={() => setImportModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="import-csv-form" disabled={importSubmitting}>
              {importSubmitting ? <Spinner className="mr-1.5 size-3.5" /> : null}
              Import Roster
            </Button>
          </div>
        }
      >
        <form id="import-csv-form" onSubmit={handleImportCsv} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Paste CSV text with columns: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">Full Name, Username, Email, Phone, Batch, Password</code>. Phone is used for student mobile login. Password defaults to <code className="font-mono">112345</code> if omitted.
          </p>

          <Textarea
            rows={8}
            required
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`Full Name, Username, Email, Phone, Batch, Password\nAditi Verma, aditiv, aditi@example.com, +91 9876543210, JEE-2027-A, 112345\nKaran Patel, karanp, karan@example.com, +91 9876543211, JEE-2027-B,`}
            className="font-mono text-xs"
          />

          {importErrors.length > 0 && (
            <Alert tone="red" title={`Found ${importErrors.length} validation issue(s):`}>
              <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs">
                {importErrors.map((err, i) => (
                  <li key={i}>
                    {err.row > 0 ? `Row ${err.row}: ` : ''}
                    {err.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </form>
      </Dialog>

      {/* 3. Bulk Assign Batch Modal */}
      <Dialog
        isOpen={batchModalOpen}
        onClose={() => !batchSubmitting && setBatchModalOpen(false)}
        title={`Assign Batch to ${selectedIds.size} Student(s)`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={batchSubmitting}
              onClick={() => setBatchModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="bulk-batch-form" disabled={batchSubmitting}>
              {batchSubmitting ? <Spinner className="mr-1.5 size-3.5" /> : null}
              Update Batch
            </Button>
          </div>
        }
      >
        <form id="bulk-batch-form" onSubmit={handleBulkBatch} className="space-y-3">
          <Label>Batch Name</Label>
          <Input
            required
            value={targetBatchName}
            onChange={(e) => setTargetBatchName(e.target.value)}
            placeholder="e.g. JEE-2027-CrashCourse"
            list="bulk-batch-list"
          />
          <datalist id="bulk-batch-list">
            {batches.map((b) => (
              <option key={b.name} value={b.name} />
            ))}
          </datalist>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Type a new batch name or pick an existing one to update all selected students simultaneously.
          </p>
        </form>
      </Dialog>

      {/* 4. Edit Student & Password Reset Modal */}
      <Dialog
        isOpen={editModalOpen}
        onClose={() => !editSubmitting && setEditModalOpen(false)}
        title={`Edit Student: ${selectedStudent?.username}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={editSubmitting}
              onClick={() => setEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="edit-student-form" disabled={editSubmitting}>
              {editSubmitting ? <Spinner className="mr-1.5 size-3.5" /> : null}
              Save Changes
            </Button>
          </div>
        }
      >
        <form id="edit-student-form" onSubmit={handleEditStudent} className="space-y-3.5">
          <div>
            <Label>Full Name</Label>
            <Input
              required
              value={editForm.fullName}
              onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Mobile Number (for student login)</Label>
            <Input
              type="tel"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
          <div>
            <Label>Batch</Label>
            <Input
              value={editForm.batch}
              onChange={(e) => setEditForm({ ...editForm, batch: e.target.value })}
              placeholder="e.g. JEE-2027-A"
              list="edit-batch-list"
            />
            <datalist id="edit-batch-list">
              {batches.map((b) => (
                <option key={b.name} value={b.name} />
              ))}
            </datalist>
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <Label>Reset Password (leave blank to keep current)</Label>
            <Input
              type="password"
              value={editForm.newPassword}
              onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
              placeholder="Enter new password (min 4 characters)"
            />
          </div>
        </form>
      </Dialog>

      {/* 5. Activate/Deactivate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={activeToggleTarget !== null}
        onClose={() => setActiveToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={activeToggleTarget?.isActive ? 'Deactivate Student Account' : 'Activate Student Account'}
        description={
          activeToggleTarget?.isActive
            ? `Are you sure you want to deactivate ${activeToggleTarget?.fullName} (${activeToggleTarget?.username})? They will be barred from signing in until reactivated.`
            : `Re-activate ${activeToggleTarget?.fullName} (${activeToggleTarget?.username}) so they can log in and take tests?`
        }
        confirmText={activeToggleTarget?.isActive ? 'Deactivate Account' : 'Activate Account'}
        tone={activeToggleTarget?.isActive ? 'danger' : 'brand'}
      />
    </div>
  );
}
