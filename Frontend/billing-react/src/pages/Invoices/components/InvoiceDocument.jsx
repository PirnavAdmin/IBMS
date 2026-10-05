import {
  InvoiceTotals,
  InvoiceValues,
  identifier,
  date,
  money,
} from "./InvoiceShared";
export function InvoiceDocument({ invoice, calculation, customer }) {
  const person = customer || invoice.customer;
  const currency = invoice.currency;
  return (
    <article className="invoice-document">
      <header>
        <div>
          <span className="invoice-eyebrow">Invoice</span>
          <h2>{invoice.id ? identifier(invoice) : "Draft preview"}</h2>
        </div>
        <strong>{invoice.status || "Unsaved draft"}</strong>
      </header>
      <InvoiceValues
        values={[
          ["Customer", person?.name],
          ["Invoice date", date(invoice.invoiceDate)],
          ["Due date", date(invoice.dueDate)],
          ["Currency", currency],
          ["Reference", invoice.reference],
          ["Customer tax ID", person?.taxId],
        ]}
      />
      {person && (
        <section className="invoice-address">
          <h3>Current customer billing address</h3>
          <p>
            {[
              person.address,
              person.city,
              person.state,
              person.postalCode,
              person.country,
            ]
              .filter(Boolean)
              .join(", ") || "No address supplied by customer API."}
          </p>
          <p>{person.email}</p>
        </section>
      )}
      <div className="invoice-table-scroll">
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description / HSN</th>
              <th className="numeric">Qty</th>
              <th className="numeric">Rate</th>
              <th className="numeric">Discount</th>
              <th className="numeric">Tax</th>
              <th className="numeric">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((item, index) => {
              const financial = calculation?.items?.[index] || item;
              return (
                <tr key={item.id || index}>
                  <td>
                    {item.description}
                    <small>{item.hsnsac}</small>
                  </td>
                  <td className="numeric">{item.quantity}</td>
                  <td className="numeric">{money(item.unitPrice, currency)}</td>
                  <td className="numeric">
                    {money(financial.discountAmount, currency)}
                  </td>
                  <td className="numeric">
                    {money(financial.taxAmount, currency)}
                  </td>
                  <td className="numeric">
                    {money(
                      financial.lineTotal ?? financial.totalAmount,
                      currency,
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="invoice-document-bottom">
        <section>
          <h3>Notes</h3>
          <p className="invoice-preserve-text">{invoice.notes || "\u2014"}</p>
          <h3>Terms &amp; conditions</h3>
          <p className="invoice-preserve-text">
            {invoice.termsAndConditions || "\u2014"}
          </p>
          {person?.paymentTerms && (
            <>
              <h3>Current customer payment terms</h3>
              <p>{person.paymentTerms}</p>
            </>
          )}
        </section>
        <InvoiceTotals
          invoice={invoice}
          calculation={calculation}
          currency={currency}
        />
      </div>
    </article>
  );
}
