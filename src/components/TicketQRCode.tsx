type Props = {
  value: string
}

function shouldFill(value: string, index: number) {
  const charCode = value.charCodeAt(index % value.length)
  return (charCode + index * 7) % 3 !== 0
}

export default function TicketQRCode({ value }: Props) {
  const cells = Array.from({ length: 49 }, (_, index) => shouldFill(value, index))

  return (
    <div className="mx-auto grid h-28 w-28 grid-cols-7 gap-1 rounded-xl bg-white p-2 shadow-inner">
      {cells.map((filled, index) => (
        <div
          key={index}
          className={filled ? "rounded-sm bg-slate-900" : "rounded-sm bg-slate-100"}
        />
      ))}
    </div>
  )
}
