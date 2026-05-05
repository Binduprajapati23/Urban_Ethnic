import OwnerOrders from "./OwnerOrders";

const OwnerBuyOrders = () => (
  <OwnerOrders
    typeFilter="buy"
    title="Buy orders"
    subtitle="Customers who purchased products outright."
    showTabs={false}
    showTypeColumn={false}
  />
);

export default OwnerBuyOrders;
