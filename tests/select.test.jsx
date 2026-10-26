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
