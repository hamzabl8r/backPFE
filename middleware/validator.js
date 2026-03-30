const { check, validationResult } = require("express-validator");
exports.registerRules = () => [
  
  check("email", "email is required").notEmpty(),
  check("email", "email is required").isEmail(),
    
];

exports.validation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ errors: errors.array().map((el) => ({ msg: el.msg })) });
  }
  next();
};

exports.loginRules = () => [
  check("email", "email is required").notEmpty(),
  check("email", "email is required").isEmail(),
  check(
    "password",
    "password must be between 6 character and 20 character"
  ).isLength({
    min: 6,
    max: 20,
  }),
];
