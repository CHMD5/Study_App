import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Badge,
  ConfirmDialog,
  Dialog,
  Pagination,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './ui';

describe('UI Primitives Rendering', () => {
  it('renders Dialog markup with role="dialog" and accessibility attributes', () => {
    const html = renderToStaticMarkup(
      <Dialog isOpen={true} onClose={() => {}} title="Test Modal" description="Modal description">
        <div>Modal Content</div>
      </Dialog>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Test Modal');
    expect(html).toContain('Modal description');
    expect(html).toContain('Modal Content');
  });

  it('renders ConfirmDialog markup with proper buttons and tone', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete Question?"
        description="This cannot be undone."
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        tone="danger"
      />,
    );
    expect(html).toContain('Delete Question?');
    expect(html).toContain('This cannot be undone.');
    expect(html).toContain('Yes, Delete');
    expect(html).toContain('No, Keep');
    expect(html).toContain('text-red-700');
  });

  it('does not render Dialog content when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <Dialog isOpen={false} onClose={() => {}} title="Closed Modal">
        <div>Should Not Appear</div>
      </Dialog>,
    );
    expect(html).toBe('');
  });

  it('renders Table hierarchy with proper styling and tags', () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Header 1</TableHead>
            <TableHead>Header 2</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cell 1</TableCell>
            <TableCell>Cell 2</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(html).toContain('<table');
    expect(html).toContain('<thead');
    expect(html).toContain('<th');
    expect(html).toContain('Header 1');
    expect(html).toContain('<tbody');
    expect(html).toContain('<td');
    expect(html).toContain('Cell 1');
  });

  it('renders Tabs and active tab content', () => {
    const html = renderToStaticMarkup(
      <Tabs value="tab1" onValueChange={() => {}}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Tab 1');
    expect(html).toContain('Tab 2');
    expect(html).toContain('Content 1');
    expect(html).not.toContain('Content 2');
  });

  it('renders Pagination controls and calculates pages properly', () => {
    const html = renderToStaticMarkup(
      <Pagination
        currentPage={3}
        totalPages={10}
        totalItems={250}
        pageSize={25}
        onPageChange={() => {}}
      />,
    );
    expect(html).toContain('role="navigation"');
    expect(html).toContain('3 / 10');
    expect(html).toContain('51');
    expect(html).toContain('75');
    expect(html).toContain('250');
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });

  it('renders StatTile with KPI and tone', () => {
    const html = renderToStaticMarkup(
      <StatTile
        label="Average Score"
        value="84.5 M"
        tone="brand"
        subtext="+12% from last week"
      />,
    );
    expect(html).toContain('Average Score');
    expect(html).toContain('84.5 M');
    expect(html).toContain('+12% from last week');
    expect(html).toContain('text-brand-700');
  });

  it('renders Skeletons with animation classes', () => {
    const html1 = renderToStaticMarkup(<Skeleton className="size-8" />);
    const html2 = renderToStaticMarkup(<SkeletonText lines={3} />);
    const html3 = renderToStaticMarkup(<SkeletonCard />);

    expect(html1).toContain('animate-pulse');
    expect(html2).toContain('animate-pulse');
    expect(html3).toContain('animate-pulse');
  });

  it('renders Badges and tone classes', () => {
    const greenBadge = renderToStaticMarkup(<Badge tone="green">Passed</Badge>);
    const redBadge = renderToStaticMarkup(<Badge tone="red">Failed</Badge>);
    const amberBadge = renderToStaticMarkup(<Badge tone="amber">Pending</Badge>);

    expect(greenBadge).toContain('bg-emerald-50');
    expect(redBadge).toContain('bg-red-50');
    expect(amberBadge).toContain('bg-amber-50');
  });
});
