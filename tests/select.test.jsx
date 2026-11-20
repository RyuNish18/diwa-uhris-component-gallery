/**
 * select.test.jsx
 *
 * Select renders a branded listbox instead of the browser's native popup, so
 * the open dropdown follows the DIWA palette (no OS-blue highlight). A hidden
 * native <select> keeps forms, refs and `event.target.value` working.
 */

const React = require('react');
const { render, screen, fireEvent, act } = require('@testing-library/react');
const { Select } = require('../src/ui-library/gallery/select/Select');
const Modal = require('../src/ui-library/gallery/modal/Modal').default;
const { Popover, PopoverTrigger, PopoverContent } = require('../src/ui-library/gallery/popover/Popover');

const ITEMS = [
  { value: '', label: 'Choose rank' },
  { value: 'exec', label: '1: Executive' },
  { value: 'mgr', label: '2: Manager' },
  { value: 'old', label: '3: Retired', disabled: true },
];

const h = React.createElement;

function Controlled(props) {
  const [value, setValue] = React.useState(props.initial ?? '');
  return h(Select, {
    'aria-label': 'Rank',
    items: ITEMS,
    value,
    onChange: (e) => { props.onChange?.(e); setValue(e.target.value); },
    ...props.extra,
  });
}

const trigger = () => screen.getByRole('combobox', { name: 'Rank' });

describe('Select', () => {
  it('opens a branded listbox instead of the native popup', () => {
    render(h(Controlled));
    fireEvent.click(trigger());

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('data-pis-floating');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose rank', '1: Executive', '2: Manager', '3: Retired',
    ]);
    expect(screen.getByRole('option', { name: '3: Retired' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('selects with the mouse and reports event.target.value', () => {
    const onChange = jest.fn();
    render(h(Controlled, { onChange }));
    fireEvent.click(trigger());
    fireEvent.mouseDown(screen.getByRole('option', { name: '2: Manager' }));
    fireEvent.click(screen.getByRole('option', { name: '2: Manager' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe('mgr');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('2: Manager');
  });

  it('ignores disabled options', () => {
    const onChange = jest.fn();
    render(h(Controlled, { onChange }));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: '3: Retired' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports keyboard navigation', () => {
    const onChange = jest.fn();
    render(h(Controlled, { onChange, initial: 'exec' }));
    const t = trigger();
    t.focus();

    fireEvent.keyDown(t, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Opens on the current value, like a native select.
    expect(t.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: '1: Executive' }).id);

    fireEvent.keyDown(t, { key: 'ArrowDown' });
    fireEvent.keyDown(t, { key: 'ArrowDown' }); // skips disabled "Retired", stays on Manager
    expect(t.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: '2: Manager' }).id);

    fireEvent.keyDown(t, { key: 'Enter' });
    expect(onChange.mock.calls[0][0].target.value).toBe('mgr');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.keyDown(t, { key: ' ' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(t, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the placeholder when no value is selected', () => {
    render(h(Select, { 'aria-label': 'Rank', items: ITEMS.slice(1), placeholder: 'Select rank…' }));
    expect(trigger()).toHaveTextContent('Select rank…');
  });

  it('works uncontrolled with defaultValue', () => {
    render(h(Select, { 'aria-label': 'Rank', items: ITEMS, defaultValue: 'exec' }));
    expect(trigger()).toHaveTextContent('1: Executive');
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: '2: Manager' }));
    expect(trigger()).toHaveTextContent('2: Manager');
  });

  it('keeps a native select for forms and refs', () => {
    const ref = React.createRef();
    const { container } = render(h(Controlled, { initial: 'exec', extra: { name: 'rank', ref } }));
    const native = container.querySelector('select[name="rank"]');
    expect(native).toBeInstanceOf(HTMLSelectElement);
    expect(ref.current).toBe(native);
    expect(native.value).toBe('exec');

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: '2: Manager' }));
    expect(native.value).toBe('mgr');
  });

  it('associates with a <label htmlFor>', () => {
    render(h('div', null,
      h('label', { htmlFor: 'rank' }, 'Rank'),
      h(Select, { id: 'rank', items: ITEMS }),
    ));
    expect(screen.getByRole('combobox', { name: 'Rank' })).toHaveAttribute('id', 'rank');
  });

  it('does not open when disabled', () => {
    render(h(Select, { 'aria-label': 'Rank', items: ITEMS, disabled: true }));
    fireEvent.click(trigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('Select inside an open Modal', () => {
  it('selects an option and closes only the listbox on Escape', async () => {
    const onClose = jest.fn();
    const onChange = jest.fn();
    render(h(Modal, { isOpen: true, title: 'Edit Position', onClose }, h(Controlled, { onChange })));

    fireEvent.click(trigger());
    const option = await screen.findByRole('option', { name: '1: Executive' });
    expect(screen.getByRole('listbox').style.pointerEvents).toBe('auto');
    // Portaled into the dialog so its scroll lock allows wheel/touch scrolling.
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('listbox'));
    await act(async () => {
      fireEvent.pointerDown(option);
      fireEvent.mouseDown(option);
      fireEvent.pointerUp(option);
      fireEvent.mouseUp(option);
      fireEvent.click(option);
    });
    expect(onChange.mock.calls[0][0].target.value).toBe('exec');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(trigger());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Select inside an open Popover', () => {
  function PopoverWithSelect({ onChange, onOpenChange }) {
    const [open, setOpen] = React.useState(true);
    return h(
      Popover,
      {
        open,
        onOpenChange: (next) => {
          onOpenChange?.(next);
          setOpen(next);
        },
      },
      h(PopoverTrigger, null, 'Table options'),
      h(PopoverContent, { title: 'Table options' }, h(Controlled, { onChange })),
    );
  }

  it('portals the listbox to document.body and selects an option without closing the popover', async () => {
    const onChange = jest.fn();
    const onOpenChange = jest.fn();
    render(h(PopoverWithSelect, { onChange, onOpenChange }));

    fireEvent.click(trigger());
    const listbox = await screen.findByRole('listbox');
    const dialog = screen.getByRole('dialog');
    expect(listbox.parentElement).toBe(document.body);
    expect(dialog).not.toContainElement(listbox);

    const option = screen.getByRole('option', { name: '1: Executive' });
    await act(async () => {
      fireEvent.pointerDown(option);
      fireEvent.mouseDown(option);
      fireEvent.pointerUp(option);
      fireEvent.mouseUp(option);
      fireEvent.click(option);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe('exec');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes only the listbox on Escape and still closes the popover on outside click', async () => {
    const onOpenChange = jest.fn();
    render(h(PopoverWithSelect, { onOpenChange }));

    fireEvent.click(trigger());
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      fireEvent.pointerDown(document.body);
      fireEvent.mouseDown(document.body);
      fireEvent.pointerUp(document.body);
      fireEvent.mouseUp(document.body);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('portals to document.body when an enclosing dialog has a CSS transform', async () => {
    render(
      h(
        'div',
        { role: 'dialog', style: { transform: 'translate(-50%, -50%)' } },
        h(Controlled),
      ),
    );

    fireEvent.click(trigger());
    const listbox = await screen.findByRole('listbox');
    expect(listbox.parentElement).toBe(document.body);
    expect(screen.getByRole('dialog')).not.toContainElement(listbox);
  });
});
