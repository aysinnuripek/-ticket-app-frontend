type Props = {
  name: string
  price: number
  quantity: number
  onDecrease: () => void
  onIncrease: () => void
}

export default function TicketTypeRow({
  name,
  price,
  quantity,
  onDecrease,
  onIncrease,
}: Props) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
        <p className="mt-1 text-slate-600">₺{price}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onDecrease}
          className="h-9 w-9 rounded-full border border-slate-300 text-xl"
        >
          -
        </button>

        <span className="w-6 text-center font-semibold">{quantity}</span>

        <button
          onClick={onIncrease}
          className="h-9 w-9 rounded-full border border-slate-300 text-xl"
        >
          +
        </button>
      </div>
    </div>
  )
}
