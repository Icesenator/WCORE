module.exports = [
  {
    label: "RPC consensus",
    text: "RPC endpoints can disagree because they may lag, fail, or report different chain states. WCORE compares live answers and uses consensus instead of trusting the first response.",
  },
  {
    label: "Price verification",
    text: "Balance verification is only half the job. WCORE uses a price cascade across independent sources and keeps stale data from becoming false certainty.",
  },
];
