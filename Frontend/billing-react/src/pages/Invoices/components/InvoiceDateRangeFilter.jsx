import { useState } from "react";
import { Button, Popover, TextField } from "@mui/material";
import { ArrowDropDown, CalendarTodayOutlined } from "@mui/icons-material";

const displayDate = (value) => value.split("-").reverse().join("/");

export function InvoiceDateRangeFilter({ startDate, endDate, onApply }) {
  const [anchor, setAnchor] = useState(null);
  const [draft, setDraft] = useState({ startDate: "", endDate: "" });
  const invalidRange = Boolean(
    draft.startDate && draft.endDate && draft.endDate < draft.startDate,
  );
  const label = startDate && endDate
    ? `${displayDate(startDate)} – ${displayDate(endDate)}`
    : startDate
      ? `From ${displayDate(startDate)}`
      : endDate
        ? `Until ${displayDate(endDate)}`
        : "Date Range";

  const close = () => setAnchor(null);

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        className="invoice-filter-date-range"
        startIcon={<CalendarTodayOutlined />}
        endIcon={<ArrowDropDown />}
        aria-label={`Date Range: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? "invoice-date-range-popover" : undefined}
        onClick={(event) => {
          setDraft({ startDate, endDate });
          setAnchor(event.currentTarget);
        }}
      >
        {label}
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{ className: "invoice-date-range-popover" }}
      >
        <form
          id="invoice-date-range-popover"
          role="dialog"
          aria-label="Date Range"
          className="invoice-date-range-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalidRange) return;
            onApply(draft);
            close();
          }}
        >
          <TextField
            label="From Date"
            type="date"
            size="small"
            fullWidth
            value={draft.startDate}
            onChange={(event) => setDraft((previous) => ({
              ...previous, startDate: event.target.value,
            }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ "aria-label": "From Date" }}
          />
          <TextField
            label="To Date"
            type="date"
            size="small"
            fullWidth
            value={draft.endDate}
            onChange={(event) => setDraft((previous) => ({
              ...previous, endDate: event.target.value,
            }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: draft.startDate || undefined, "aria-label": "To Date" }}
            error={invalidRange}
            helperText={invalidRange ? "To Date must be on or after From Date." : undefined}
          />
          <div className="invoice-date-range-actions">
            <Button
              type="button"
              variant="outlined"
              onClick={() => {
                onApply({ startDate: "", endDate: "" });
                close();
              }}
            >
              Clear
            </Button>
            <Button type="submit" variant="contained" disabled={invalidRange}>
              Apply
            </Button>
          </div>
        </form>
      </Popover>
    </>
  );
}
